"""Child-process lifecycle for the BlomboUI launcher."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
JobObjectExtendedLimitInformation = 9
PROCESS_SET_QUOTA = 0x0100
PROCESS_TERMINATE = 0x0001

_CHILDREN: list[subprocess.Popen] = []
_JOB = None


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"


def _win_creationflags() -> int:
    if sys.platform != "win32":
        return 0
    return CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP


def create_job_object():
    """Kill FastAPI/Vite/ComfyUI when this launcher process dies (terminal closed)."""
    global _JOB
    if sys.platform != "win32":
        _JOB = None
        return None
    import ctypes
    from ctypes import wintypes

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    ]

    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        _JOB = None
        return None
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    ok = kernel32.SetInformationJobObject(
        job,
        JobObjectExtendedLimitInformation,
        ctypes.byref(info),
        ctypes.sizeof(info),
    )
    if not ok:
        kernel32.CloseHandle(job)
        _JOB = None
        return None
    _JOB = job
    return job


def _assign_pid_to_job(job, pid: int) -> None:
    if job is None or sys.platform != "win32":
        return
    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    handle = kernel32.OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, False, pid)
    if not handle:
        return
    try:
        kernel32.AssignProcessToJobObject(job, handle)
    finally:
        kernel32.CloseHandle(handle)


def install_close_handler() -> None:
    if sys.platform != "win32":
        return
    import ctypes
    from ctypes import wintypes

    Handler = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

    def _on_console(event: int) -> bool:
        if event in (0, 1, 2, 5, 6):
            for proc in list(_CHILDREN):
                stop(proc)
        return True

    handler = Handler(_on_console)
    ctypes.windll.kernel32.SetConsoleCtrlHandler(handler, True)
    install_close_handler._keep = handler  # type: ignore[attr-defined]


def _local_port(addr: str) -> int | None:
    if addr.startswith("["):
        try:
            return int(addr.rsplit("]", 1)[1].lstrip(":"))
        except (IndexError, ValueError):
            return None
    try:
        return int(addr.rsplit(":", 1)[1])
    except (IndexError, ValueError):
        return None


def pids_listening(port: int) -> set[int]:
    if sys.platform != "win32":
        return set()
    try:
        out = subprocess.check_output(["netstat", "-ano", "-p", "tcp"], text=True, errors="ignore")
    except (OSError, subprocess.CalledProcessError):
        return set()
    pids: set[int] = set()
    me = os.getpid()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        if parts[-2].upper() != "LISTENING":
            continue
        if _local_port(parts[1]) != port:
            continue
        try:
            pid = int(parts[-1])
        except ValueError:
            continue
        if pid not in (0, me):
            pids.add(pid)
    return pids


def _kill_pid_tree(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.call(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return
    try:
        os.kill(pid, 15)
    except OSError:
        return


def free_port(port: int) -> None:
    pids = pids_listening(port)
    if not pids:
        return
    print(f"    {_c('38;5;221', 'WARN')}   Port {port} in use; stopping leftover process")
    for pid in pids:
        _kill_pid_tree(pid)
    time.sleep(0.3)


def stop(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    _kill_pid_tree(proc.pid)


def reachable(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as res:
            return 200 <= res.status < 500
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def wait_ready(url: str, proc: subprocess.Popen, port: int, tries: int = 50) -> bool:
    for _ in range(tries):
        if proc.poll() is not None:
            return False
        listening = pids_listening(port)
        if listening and proc.pid not in listening:
            time.sleep(0.2)
            continue
        if reachable(url):
            return True
        time.sleep(0.2)
    return False


def spawn(
    args: list[str],
    *,
    cwd: Path,
    env: dict[str, str] | None = None,
    log=None,
) -> subprocess.Popen:
    extra: dict = {}
    if log is not None:
        extra["stdout"] = log
        extra["stderr"] = subprocess.STDOUT
    proc = subprocess.Popen(args, cwd=cwd, env=env, creationflags=_win_creationflags(), **extra)
    _assign_pid_to_job(_JOB, proc.pid)
    _CHILDREN.append(proc)
    return proc
