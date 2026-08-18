@echo off
:: CUDA 12.8 Torch pack. Use this if the NVIDIA driver is below 580.
title BlomboUI - Torch 2.8.0+cu128
call "%~dp0_switch.bat" 2.8.0 0.23.0 2.8.0 cu128
