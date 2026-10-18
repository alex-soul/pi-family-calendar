"""Render a unit into a staging directory; never installs or starts anything."""
import argparse
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument('--user', required=True)
parser.add_argument('--uid', required=True, type=int)
parser.add_argument('--wayland', required=True)
parser.add_argument('--backlight', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
if not re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}', args.user) or not 1 <= args.uid <= 65534:
    parser.error('Invalid desktop identity')
if not re.fullmatch(r'wayland-\d+', args.wayland):
    parser.error('Invalid Wayland display')
if not re.fullmatch(r'/sys/(?:class/backlight|devices)/[A-Za-z0-9/@:_.-]+', args.backlight) or '..' in args.backlight:
    parser.error('Invalid backlight path')
unit = (Path(__file__).parent / 'units/pi-family-calendar-display.service.in').read_text()
for key, value in {'DESKTOP_USER': args.user, 'DESKTOP_UID': args.uid,
                   'WAYLAND_DISPLAY': args.wayland, 'BACKLIGHT_PATH': args.backlight}.items():
    unit = unit.replace('@' + key + '@', str(value))
with open(args.output, 'x') as file:
    file.write(unit)
