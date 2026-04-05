import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {
    PopupMenu,
    PopupMenuSection
} from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { DisplayConfig, DisplayConfigsManager, PhysicalMonitor } from './data.js';

export class DisplayProfilesPopdown {
    #menu: PopupMenu;
    #manager: DisplayConfigsManager;
    #filledStarGIcon: Gio.ThemedIcon | null = null;
    #hollowStarGIcon: Gio.ThemedIcon | null = null;

    constructor(menu: PopupMenu, manager: DisplayConfigsManager) {
        this.#menu = menu;
        this.#manager = manager;
        // Rebuild each time it's opened
        this.#menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this.rebuild();
            }
            return false;
        });
    }

    rebuild() {
        const waiting = this.#manager.waiting;
        let configs = this.#manager.getConfigs();

        // Show compatible configs before incompatible ones (sort is stable)
        configs.sort((a, b) => {
            return (a.isCompatible ? 0 : 1) - (b.isCompatible ? 0 : 1);
        });

        // Only show the transforms column if at least one != "none"
        const showTransforms = configs.some(c => {
            return c.logicalMonitors.some(m => {
                return m.transform !== "none";
            });
        });

        // Only show connectors if more than one is referenced
        const firstConnector =
            configs[0].logicalMonitors[0].physicalMonitors[0].connector;
        const showConnectors = configs.some(c => {
            if (c.logicalMonitors.length > 1) {
                return true;
            }
            if (c.logicalMonitors[0].physicalMonitors.length > 1) {
                return true;
            }
            if (c.logicalMonitors[0].physicalMonitors[0].connector !=
                firstConnector) {
                return true;
            }
            return false;
        });

        // Only show scales if any are != 100%
        const showScales = configs.some(c => {
            return c.logicalMonitors.some(m => {
                return m.scale != 1.0;
            });
        });

        this.#menu.removeAll();
        const section = new PopupMenuSection();
        this.#menu.addMenuItem(section);
        const grid = new St.Widget({
            layout_manager: new Clutter.GridLayout(),
            style_class: 'dispprofs-grid',
            // If waiting, disable all
            reactive: !waiting
        });
        const layout = grid.layout_manager as Clutter.GridLayout;
        layout.set_column_spacing(10);
        layout.set_row_spacing(5);
        section.actor.add_child(grid);

        let row = 0;
        // Add all configs
        for (const cfg of configs) {
            row += this.#addConfigToGrid(cfg, layout, row, waiting,
                showTransforms, showConnectors, showScales);
        }
        if (waiting) {
            grid.opacity = 128;
        }
    }

    /**
     * @returns Number of rows added
     */
    #addConfigToGrid(config: DisplayConfig, layout: Clutter.GridLayout,
                     row: number, waiting: boolean, showTransforms: boolean,
                     showConnectors: boolean, showScales: boolean): number
    {
        const numMonitors = config.logicalMonitors.reduce(
            (n, m) => m.physicalMonitors.length + n, 0);

        let col = 0;
        // Column 0: Radio button
        const radioIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({
                name: config.isCurrent ? 'radio-checked-symbolic' :
                    'radio-symbolic'
            }),
            style_class: 'system-status-icon'
        });
        const radioButton = new St.Button({
            child: radioIcon,
            reactive: config.isCompatible && !waiting,
            can_focus: config.isCompatible && !waiting,
            style_class: 'dispprofs-radio-button'
        });
        if (!config.isCompatible) {
            radioButton.opacity = 128;
        }
        radioButton.connect('clicked', () => {
            this._onApplyConfig(config, false);
        });
        layout.attach(radioButton, col, row, 1, numMonitors);

        // Columns 1-3: one row per physical monitor; col will be the correct
        // column for the star icon at the end of each loop iteration
        let labelRow = row;
        for (const lm of config.logicalMonitors) {
            const scale = showScales ? `${Math.floor(lm.scale * 100)}%` : "";
            const transform = showTransforms ? lm.transform : "";
            for (let i = 0; i < lm.physicalMonitors.length; i++) {
                col = 1;
                const pm = lm.physicalMonitors[i];
                const monitorStr = this.#formatMonitor(pm, showConnectors,
                    i > 0 ? lm.physicalMonitors[0].connector : undefined);
                let b = this.#makeLabelButton(config, monitorStr, waiting,
                                              pm.preferredMode == pm.modeId);
                layout.attach(b, col++, labelRow, 1, 1);
                if (showScales) {
                    b = this.#makeLabelButton(config, scale, waiting, pm.preferredScale == lm.scale);
                    layout.attach(b, col++, labelRow, 1, 1);
                }
                if (showTransforms) {
                    b = this.#makeLabelButton(config, transform, waiting,
                                              transform == "none");
                    layout.attach(b, col++, labelRow, 1, 1);
                }
                labelRow++;
            }
        }

        // Column 2, 3, or 4: Star icon
        const starButton = this.#makeStarButton(config, waiting);
        layout.attach(starButton, col, row, 1, numMonitors);

        return numMonitors;
    }

    #makeLabelButton(config: DisplayConfig, text: string,
                     waiting: boolean, isPreferred: boolean): St.Button
    {
        const label = new St.Label({
            text, style_class: 'dispprofs-monitor-label'
        });
        if (!config.isCompatible) {
            label.style = 'color: red;';
        }
        else if (isPreferred) {
            label.style = 'color: green;';
        }
        const button = new St.Button({
            child: label,
            reactive: config.isCompatible && !waiting,
            can_focus: config.isCompatible && !waiting,
            x_align: Clutter.ActorAlign.START
        });
        button.connect('clicked', () => this._onApplyConfig(config, true));
        return button;
    }

    #makeStarButton(config: DisplayConfig, waiting: boolean): St.Button {
        const stIcon = new St.Icon({
            gicon: this.#getStarGIconForConfig(config),
            style_class: 'system-status-icon'
        });
        const button = new St.Button({
            child: stIcon,
            reactive: !waiting,
            can_focus: !waiting,
            style_class: 'dispprofs-star-button'
        });
        button.connect('clicked', () => {
            config.isFavourite = !config.isFavourite;
            stIcon.set_gicon(this.#getStarGIconForConfig(config));
        });
        return button;
    }

    #getStarGIconForConfig(config: DisplayConfig) {
        if (config.isFavourite) {
            if (!this.#filledStarGIcon) {
                this.#filledStarGIcon = new Gio.ThemedIcon({
                    name: "starred-symbolic"
                });
            }
            return this.#filledStarGIcon;
        }
        else {
            if (!this.#hollowStarGIcon) {
                this.#hollowStarGIcon = new Gio.ThemedIcon({
                    name: "non-starred-symbolic"
                });
            }
            return this.#hollowStarGIcon;
        }
    }

    #formatMonitor(monitor: PhysicalMonitor, showConnector: boolean,
                   mirrorOf?: string) {
        if (mirrorOf) {
            return `${monitor.connector}: mirror of ${mirrorOf}`;
        }
        return (showConnector ? `${monitor.connector}: ` : "") + monitor.modeId;
    }

    _onApplyConfig(config:DisplayConfig, closePopdown: boolean = false) {
        // this.#manager.applyConfig(config.id).then((success) => {
        //     if (success && closePopdown) {
        //         this.#menu.close();
        //     }
        // }).catch(e => {
        //     console.error(`Failed to apply config ${config.id}`, e);
        // });
    }
}
