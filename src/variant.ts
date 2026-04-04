import GLib from "gi://GLib?version=2.0";

/**
 * Converts a GLib.Variant to a JS native type using recursiveUnpack. It also
 * works on native types in case the DBus proxy returns values that are only
 * partially unpacked by unpack or deep_unpack.
 */
export function unpackVariant(variant: any): any
{
    if (variant instanceof GLib.Variant) {
        return variant.recursiveUnpack();
    } else if (Array.isArray(variant)) {
        return variant.map(unpackVariant);
    } else if (typeof variant === "object") {
        return Object.fromEntries(
            Object.entries(variant).map(([k, v]) => [k, unpackVariant(v)])
        );
    }
    return variant;
}

/**
 * Returns the class name when o is an object, "typeof o" otherwise.
 */
export function typeNameOf(o: any): string {
    let c = o.constructor;
    if (c && c.name)
        return c.name;
    return typeof o;
}


export interface ToVariantTuple<T extends Array<any>> {
    toTuple: () => T;
}
