# display-profiles

A GNOME shell extension to make it quick and easy to switch between your
favourite display configurations.

## Installation

npm is required because the extension is written in typescript.

1. `npm install`
1. `npm run build`
1. One of:
  * `ln -s $(pwd)/dist/src ~/.local/share/gnome-shell/extensions/display-profiles@realh`
  * `cp -r dist/src ~/.local/share/gnome-shell/extensions/display-profiles@realh`
1. Log out of GNOME and log back in
1.
  * Run `gnome-extensions enable display-profiles@realh`
  * or enable it with the GNOME Extensions app

## Licence

 display-profiles is free software: you can redistribute it and/or modify it
 under the terms of the GNU General Public License as published by the Free
 Software Foundation, either version 2 of the License, or (at your option) any
 later version.

display-profiles is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
display-profiles. If not, see <https://www.gnu.org/licenses/>.
