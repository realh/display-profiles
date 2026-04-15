/**
 * Data structures representing display configuration as tuples for DBus.
 */

import GLib from "gi://GLib?version=2.0";


export type Properties = Record<string, any>;

export function primitiveToVariant(
    a: any, numType?: string, varType?: string): GLib.Variant
{
    if (!varType) {
        switch (typeof a) {
            case "string":
                varType = "s";
                break;
            case "number":
                varType = numType || "d";
                break;
            case "boolean":
                varType = "d";
                break;
            default:
                throw new Error(
                    `GVariant: Unsupported primitive type ${typeof a}`);
        }
    }
    return GLib.Variant.new(varType, a);
}

export function packVariantsInArray(signature: string, members: GLib.Variant[]):
    GLib.Variant
{
    return GLib.Variant.new_array(GLib.VariantType.new(signature), members);
}

export function packVariantsInTuple(members: GLib.Variant[]): GLib.Variant {
    return GLib.Variant.new_tuple(members);
}

export function propertiesToVariant(
    a: Properties, numType?: string, varType?: string): GLib.Variant
{
    const entries: GLib.Variant[] = Object.entries(a).map(([k, v]) => {
        const key = GLib.Variant.new("s", k);
        const value = primitiveToVariant(v, numType, varType);
        return GLib.Variant.new_dict_entry(key, value);
    });
    return packVariantsInArray("{sv}", entries);
}

/** Names are defined in data.ts */
export type MonitorTransform = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PhysicalMonitorConfigProperties extends Properties {
    underscanning: boolean | undefined;
}

/**
 * Configuration of a single physical monitor as passed to
 * DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type PhysicalMonitorConfigTuple = [
    string, string,                                 // connector, mode_id
    PhysicalMonitorConfigProperties,
];

export function physicalMonitorConfigTupleToVariant(
    tuple: PhysicalMonitorConfigTuple
): GLib.Variant {
    return packVariantsInTuple(
        [
            primitiveToVariant(tuple[0], 's'),
            primitiveToVariant(tuple[1], 's'),
            propertiesToVariant(tuple[2]),
        ]
    )
}

/**
 * Configuration of a single logical monitor as passed to
 * DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type LogicalMonitorConfigTuple = [
    number, number, number,         // x, y, scale
    MonitorTransform, boolean,      // transform, primary
    PhysicalMonitorConfigTuple[],
];

export function logicalMonitorConfigTupleToVariant(
    tuple: LogicalMonitorConfigTuple
): GLib.Variant {
    const phys = tuple[5].map(physicalMonitorConfigTupleToVariant);
    const physVariant = packVariantsInArray("(ssa{sv})", phys);
    return packVariantsInTuple(
        [
            primitiveToVariant(tuple[0], 'i'),
            primitiveToVariant(tuple[1], 'i'),
            primitiveToVariant(tuple[2], 'd'),
            primitiveToVariant(tuple[3], 'u'),
            primitiveToVariant(tuple[4], 'b'),
            physVariant,
        ]
    )
}


export interface MonitorsConfigProperties extends Properties {
    "layout-mode": 1 | 2 | undefined;   // 1/undef = logical, 2 = physical
}

/**
 * Complete data type passed to DisplayConfigProxy.ApplyMonitorsConfigAsync.
 */
export type MonitorsConfigTuple = [
    number,         // serial
    0 | 1 | 2,      // method: 0 = verify, 1 = temporary, 2 = persistent
    LogicalMonitorConfigTuple[],
    MonitorsConfigProperties,
];

export function monitorsConfigTupleToVariant(tuple: MonitorsConfigTuple):
    GLib.Variant
{
    const props = propertiesToVariant(tuple[3], 'u');
    const mons = tuple[2].map(logicalMonitorConfigTupleToVariant);
    const monsVariant = packVariantsInArray("(iiduba(ssa{sv}))", mons);
    return packVariantsInTuple(
        [
            primitiveToVariant(tuple[0], 'u'),
            primitiveToVariant(tuple[1], 'u'),
            monsVariant,
            props,
        ]
    );
}

/** connector, manufacturer, model, serial */
export type PhysicalMonitorIdsTuple = [string, string, string, string];

export interface ModeProperties extends Properties {
    "is-current": boolean | undefined;
    "is-preferred": boolean | undefined;
    "is-interlaced": boolean | undefined;
    "refresh-rate-mode": "variable" | "fixed" | undefined;
}

/**
 * id, width, height, refresh_rate, preferred_scale, supported_scales, properties
 */
export type ModeTuple =
    [string, number, number, number, number, number[], ModeProperties];

export interface PhysicalMonitorStateProperties extends Properties {
    "is-underscanning": boolean | undefined;
}

export type PhysicalMonitorStateTuple = [
    PhysicalMonitorIdsTuple,
    ModeTuple[],
    PhysicalMonitorStateProperties
];

export type LogicalMonitorStateTuple = [
    number, number,                     // x, y
    number, MonitorTransform, boolean,  // scale, transform, primary
    PhysicalMonitorIdsTuple[],
];

export interface DisplayConfigStateProperties extends Properties {
    "layout-mode": 1 | 2 | undefined;
    "supports-changing-layout-mode": boolean | undefined;
}

/**
 * Complete data type returned by DisplayConfigProxy.GetCurrentStateAsync.
 */
export type DisplayConfigStateTuple = [
    number,     // serial
    PhysicalMonitorStateTuple[],
    LogicalMonitorStateTuple[],
    DisplayConfigStateProperties
];
