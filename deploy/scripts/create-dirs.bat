@echo off
setlocal enabledelayedexpansion

REM Create directories
echo Creating directories...
mkdir "c:\Users\shubh\Downloads\repo\kubi\k8s" 2>nul
mkdir "c:\Users\shubh\Downloads\repo\kubi\helm\kubi-ai\templates\backend" 2>nul
mkdir "c:\Users\shubh\Downloads\repo\kubi\helm\kubi-ai\templates\frontend" 2>nul
mkdir "c:\Users\shubh\Downloads\repo\kubi\helm\kubi-ai\templates\mongodb" 2>nul
mkdir "c:\Users\shubh\Downloads\repo\kubi\helm\kubi-ai\templates\redis" 2>nul

echo Directories created!
