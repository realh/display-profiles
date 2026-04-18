import type {
    DisplayConfigStateTuple,
    LogicalMonitorStateTuple,
    PhysicalMonitorStateTuple,
} from "./tuples.js";


export const monitorTransformNames = [
    "none", "90°", "180°", "270°",
    "flipped", "90° flipped", "180° flipped", "270° flipped",
];

interface ModeScales {
    preferredScale: number;
    supportedScales: number[];
}

export function formatScale(scale: number): string {
    return `${Math.floor(scale * 100)}%`;
}

/**
 * We can just ignore the preferred mode and scale because the info from DBus
 * is inconsistent; the same interface can be used in memory and in JSON.
 */
export interface PhysicalMonitor {
    readonly connector: string;
    readonly modeId: string;
    /** undefined means underscanning is unsupported */
    readonly underscanning: boolean | undefined;
}

function comparePhysicalMonitors(
    pm1: PhysicalMonitor,
    pm2: PhysicalMonitor,
) {
    let cmp = pm1.connector.localeCompare(pm2.connector);
    if (cmp !== 0) {
        return cmp;
    }
    cmp = pm1.modeId.localeCompare(pm2.modeId);
    if (cmp !== 0) {
        return cmp;
    }
    if (pm1.underscanning !== pm2.underscanning) {
        return pm1.underscanning ? -1 : 1;
    }
    return 0;
}

interface PhysicalMonitorAndModes extends PhysicalMonitor {
    readonly supportedModes: Map<string, ModeScales>;
}

export interface LogicalMonitor {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly transform: string;
    readonly primary: boolean;
    readonly physicalMonitors: PhysicalMonitor[];
}

export function deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

export function compareLogicalMonitors(
    lm1: LogicalMonitor,
    lm2: LogicalMonitor,
) {
    if (lm1.x !== lm2.x) {
        return lm1.x - lm2.x;
    }
    if (lm1.y !== lm2.y) {
        return lm1.y - lm2.y;
    }
    if (lm1.scale !== lm2.scale) {
        return lm1.scale - lm2.scale;
    }
    if (lm1.transform !== lm2.transform) {
        return lm1.transform.localeCompare(lm2.transform);
    }
    if (lm1.physicalMonitors.length !== lm2.physicalMonitors.length) {
        return lm1.physicalMonitors.length - lm2.physicalMonitors.length;
    }
    lm1.physicalMonitors.sort((a, b) => comparePhysicalMonitors(a, b));
    lm2.physicalMonitors.sort((a, b) => comparePhysicalMonitors(a, b));
    for (let i = 0; i < lm1.physicalMonitors.length; i++) {
        const pm1 = lm1.physicalMonitors[i];
        const pm2 = lm2.physicalMonitors[i];
        const cmp = comparePhysicalMonitors(pm1, pm2);
        if (cmp !== 0) {
            return cmp;
        }
    }
    return 0;
}

export interface SavedDisplayConfig {
    readonly logicalMonitors: LogicalMonitor[];
    readonly layoutMode: "logical" | "physical";
}

export function describeDisplayConfig(config: SavedDisplayConfig): string {
    const lms = config.logicalMonitors.flatMap(lm => {
        const scale = formatScale(lm.scale);
        return lm.physicalMonitors.map(pm => {
            const pScale = (<any>pm)["preferredScale"];
            const prefScale = pScale !== undefined ?
                ` (pref ${formatScale(pScale)})` : "";
            return `${pm.connector}: ${pm.modeId} ${scale}${prefScale}`;
        });
    });
    return JSON.stringify(lms, null, 2);
}

/**
 * DisplayConfig represents a single possible display configuration. id is
 * unique for each DisplayConfig. It helps identify a config when its favourite
 * status is toggled in the UI - this is because the DisplayConfig[] passed to
 * the UI is a deep copy of #allConfigs and/or #currentState.
 */
export interface DisplayConfig extends SavedDisplayConfig {
    id: number;
    isCurrent: boolean;
    isFavourite: boolean;
    isCompatible: boolean;
}

/**
 * Removes the fields we don't want to save to favourites.
 */
export function pruneDisplayConfig(dc: DisplayConfig): SavedDisplayConfig {
    return {
        logicalMonitors: dc.logicalMonitors,
        layoutMode: dc.layoutMode,
    };
}

/**
 * DisplayState holds the current state read from DBus.
 */
export class DisplayState {
    #serial: number;
    get serial(): number {
        return this.#serial;
    }

    #id: number;
    get id(): number {
        return this.#id;
    }

    physicalMonitors: Map<string, PhysicalMonitorAndModes>;
    #logicalMonitors: LogicalMonitor[];
    #layoutMode: 1 | 2 | undefined;

    get layoutMode(): "logical" | "physical" {
        return this.#layoutMode === 2 ? "physical" : "logical";
    }

    #supportsChangingLayoutMode: boolean;
    get supportsChangingLayoutMode(): boolean {
        return this.#supportsChangingLayoutMode;
    }

    isFavourite: boolean = false;

    #debug: boolean;
    #log: (...args: any) => void;

    /**
     * @param stateTuple Current state from DBus.
     * @param id Unique id for the DisplayConfig.
     */
    constructor(stateTuple: DisplayConfigStateTuple, id: number,
               debug:boolean)
    {
        this.#debug = debug;
        this.#log = debug ?
            (...args: any) => console.log("DP@realh DState:", ...args) :
            () => { };
        this.#serial = stateTuple[0];
        this.#id = id;
        this.physicalMonitors = new Map();
        this.#logicalMonitors = [];
        this.#log(`State tuple has ${stateTuple[1].length} physical ` +
            `monitors, ${stateTuple[2].length} logical monitors`);
        this.#parsePhysicalMonitors(stateTuple[1]);
        this.#parseLogicalMonitors(stateTuple[2]);
        this.#layoutMode = stateTuple[3]["layout-mode"];
        this.#supportsChangingLayoutMode =
            stateTuple[3]["supports-changing-layout-mode"] === true;
    }

    #parsePhysicalMonitors(physicalMonitors: PhysicalMonitorStateTuple[]) {
        for (const pm of physicalMonitors) {
            const connector = pm[0][0];
            let modeId = "";
            const supportedModes = new Map<string, ModeScales>;

            for (const mode of pm[1]) {
                const props = mode[6];
                if (props["is-current"]) {
                    if (modeId !== "" && this.#debug) {
                        this.#log(
                            `${connector} has more than one current mode: ` +
                            `${modeId} and ` +
                            `${mode[0]} (scale ${formatScale(mode[4])})`);
                    }
                    modeId = mode[0];
                    this.#log(`Current mode on ${connector} is ${mode[0]} ` +
                             `pref scale ${formatScale(mode[4])}`);
                }
                if (props["is-preferred"]) {
                    this.#log(`Preferred mode on ${connector} is ${mode[0]} ` +
                             formatScale(mode[4]));
                }
                supportedModes.set(mode[0], {
                    preferredScale: mode[4],
                    supportedScales: mode[5],
                });
            }
            let underscanning = pm[2]["is-underscanning"];
            this.physicalMonitors.set(connector, {
                connector,
                modeId,
                underscanning,
                supportedModes
            });
        }
    }

    #parseLogicalMonitors(logicalMonitors: LogicalMonitorStateTuple[]) {
        try {
            for (const lm of logicalMonitors) {
                const phys = lm[5].map((pmIds) => {
                    const pm = this.physicalMonitors.get(pmIds[0]);
                    if (pm === undefined) {
                        throw new Error(`Physical monitor ${pm} not found`);
                    }
                    return pm;
                });
                let i = lm[3];
                if (i < 0 || i >= monitorTransformNames.length) {
                    i = 0;
                }
                this.#logicalMonitors.push({
                    x: lm[0],
                    y: lm[1],
                    scale: lm[2],
                    transform: monitorTransformNames[i],
                    primary: lm[4],
                    physicalMonitors: phys,
                });
            }
        } catch (e) {
            console.error("DisplayProfiles@realh: Invalid state from DBus: ",
                          e);
        }
    }

    /**
     * Note the result has an id of 0. It should be changed to a unique value
     * by the caller.
     */
    getDisplayConfig(): DisplayConfig {
        return {
            id: this.id,
            logicalMonitors: deepCopy(this.#logicalMonitors),
            layoutMode: this.layoutMode,
            isCurrent: true,
            isFavourite: this.isFavourite,
            isCompatible: true,
        };
    }

    checkCompatibility(config: SavedDisplayConfig): boolean {
        if (config.layoutMode !== this.layoutMode &&
            !this.supportsChangingLayoutMode)
        {
            return false;
        }
        for (const lm of config.logicalMonitors) {
            for (const pm of lm.physicalMonitors) {
                const currentPm = this.physicalMonitors.get(pm.connector);
                if (!currentPm) {
                    return false;
                }
                if (!currentPm.supportedModes.has(pm.modeId)) {
                    return false;
                }
            }
        }
        return true;
    }

    describe(): string {
        let s = "DisplayState; logical monitors:\n" +
            describeDisplayConfig(this.getDisplayConfig()) +
            "\nphysical monitors:\n";
        for (const [connector, _pm] of this.physicalMonitors) {
            s += `${connector}\n`;
        }
        return s;
    }
}
