@echo off
:: Default Torch pack for bundled ComfyUI. CUDA 13 — NVIDIA driver 580+ required.
title BlomboUI - Torch 2.10.0+cu130
call "%~dp0_switch.bat" 2.10.0 0.25.0 2.10.0 cu130
