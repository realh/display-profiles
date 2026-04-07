import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import { DisplayConfigsManager } from "./data.js";

class _DisplayProfilesGrid extends St.Widget implements DisplayProfilesGrid {
    #manager: DisplayConfigsManager

    constructor(manager: DisplayConfigsManager) {
        const layout = new Clutter.GridLayout();
        super({
            layout_manager: layout,
            style_class: 'dispprofs-grid',
            reactive: !manager.waiting
        });
        layout.set_column_spacing(10);
        layout.set_row_spacing(5);
        if (manager.waiting) {
            this.opacity = 100;
        }
        this.#manager = manager;
        this.rebuild();
    }

    rebuild() {
        const layout = this.layout_manager as Clutter.GridLayout;
        let i = 0;
        for (const y of [0, 1, 2]) {
            for (const x of [0, 1, 2]) {
                const label = new St.Label({
                    text: `${++i}`, style_class: "dispprofs-grid-label"
                });
                layout.attach(label, x, y, 1, 1);
            }
        }
    }
}

export interface DisplayProfilesGrid extends _DisplayProfilesGrid {};

export const DisplayProfilesGrid = GObject.registerClass({
    // GObject
    GTypeName: "DisplayProfilesGrid",
}, _DisplayProfilesGrid);
