//
const regProp = (options: any)=>{
    try {
        CSS?.registerProperty?.(options);
    } catch(e) {
        console.warn(e);
    };
};

//
class PointerEdge {
    pointer: [number, number] = [0, 0];
    results: any;

    //
    constructor(pointer: [number, number] = [0, 0]) {
        this.pointer = pointer;
        this.results = {
            left: false,
            top: false,
            bottom: false,
            right: false,
        };
    }

    get left() {
        const current = Math.abs(this.pointer[0] - 0) < 10;
        return (this.results.left = current);
    }

    get top() {
        const current = Math.abs(this.pointer[1] - 0) < 10;
        return (this.results.top = current);
    }

    get right() {
        const current = Math.abs(this.pointer[0] - window.innerWidth) < 10;
        return (this.results.right = current);
    }

    get bottom() {
        const current = Math.abs(this.pointer[1] - window.innerHeight) < 10;
        return (this.results.bottom = current);
    }
}

interface EvStub {
    pointerId: number;
}

interface HoldingElement {
    propertyName?: string;
    shifting?: [number, number];
    modified?: [number, number];
    element?: WeakRef<HTMLElement>;
}

interface PointerObject {
    id: number;
    movement: [number, number];
    down?: [number, number],
    current: [number, number],
    event?: MouseEvent | PointerEvent | EvStub;
    holding?: HoldingElement[];
    edges?: PointerEdge;
};

//
export const pointerMap = new Map<number, PointerObject>([
    /*[
        -1,
        {
            id: -1,
            movement: [],
            down: [],
            current: [],
            event: null,

            //
            holding: [],
        },
    ],*/
]);

//
document.documentElement.addEventListener(
    "pointerdown",
    (ev) => {
        if (ev.target == document.documentElement) {
            //
            const np: PointerObject = {
                id: ev.pointerId,
                event: ev,
                current: [ev.clientX, ev.clientY],
                down: [ev.clientX, ev.clientY],
                movement: [0, 0],
            };

            //
            const exists = (pointerMap.has(ev.pointerId)
                ? pointerMap.get(ev.pointerId)
                : np) || np;

            //
            np.movement[0] = np.current[0] - exists.current[0];
            np.movement[1] = np.current[1] - exists.current[1];

            //
            if (!exists.holding) {
                exists.holding = [];
            }

            //
            exists.holding.forEach((hm) => {
                hm.shifting = [...(hm.modified || hm.shifting || [0, 0])];
            });

            //
            if (!exists.edges) {
                exists.edges = new PointerEdge(np.current);
            }

            //
            Object.assign(exists, np);

            //
            if (!pointerMap.has(ev.pointerId)) {
                pointerMap.set(ev.pointerId, exists);
            }
        }
    },
    {capture: true}
);

//
regProp?.({
    name: "--resize-x",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
regProp?.({
    name: "--resize-y",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
regProp?.({
    name: "--shift-x",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
regProp?.({
    name: "--shift-y",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
regProp?.({
    name: "--drag-x",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
regProp?.({
    name: "--drag-y",
    syntax: "<number>",
    inherits: true,
    initialValue: `0`,
});

//
export const setProperty = (target, name, value, importance = "")=>{
    if ("attributeStyleMap" in target) {
        const raw = target.attributeStyleMap.get(name);
        const prop = raw?.[0] ?? raw?.value;
        if (parseFloat(prop) != value && prop != value || prop == null) {
            //if (raw?.[0] != null) { raw[0] = value; } else
            if (raw?.value != null) { raw.value = value; } else
            { target.attributeStyleMap.set(name, value); };
        }
    } else {
        const prop = target?.style?.getPropertyValue?.(name);
        if (parseFloat(prop) != value && prop != value || prop == null) {
            target?.style?.setProperty?.(name, value, importance);
        }
    }
}

//
const delayed = new Map<number, Function | null>([]);
requestIdleCallback(async ()=>{
    while(true) {
        for (const dl of delayed.entries()) {
            dl[1]?.(); delayed.delete(dl[0]);
        }

        //
        try { await (new Promise((rs)=>requestAnimationFrame(rs))); } catch(e) { break; };
    }
}, {timeout: 1000});

//
const callByFrame = (pointerId, cb)=>{
    delayed.set(pointerId, cb);
}

//
addEventListener("beforeunload", (event) => { delayed.clear(); pointerMap.clear(); });
addEventListener("pagehide", (event) => { delayed.clear(); pointerMap.clear(); });

//
document.addEventListener("visibilitychange", () => {
    if (document.hidden) { delayed.clear(); pointerMap.clear(); };
});

//
document.documentElement.addEventListener(
    "pointermove",
    (ev) => {
        //if (ev.target == document.documentElement) {
        const np: PointerObject = {
            id: ev.pointerId,
            event: ev,
            current: [ev.clientX, ev.clientY],
            movement: [0, 0],
        };

        //
        const exists = (pointerMap.has(ev.pointerId)
            ? pointerMap.get(ev.pointerId)
            : np) || np;
        np.movement[0] = np.current[0] - exists.current[0];
        np.movement[1] = np.current[1] - exists.current[1];

        //
        if (!exists.holding) {
            exists.holding = [];
        }

        //
        if ((exists.holding.length || 0) > 0) {
            ev.stopImmediatePropagation();
            ev.stopPropagation();
            ev.preventDefault();
        }

        //
        if (!exists.edges) {
            exists.edges = new PointerEdge(np.current);
        }

        //
        Object.assign(exists, np);

        //
        if (!pointerMap.has(ev.pointerId)) {
            pointerMap.set(ev.pointerId, exists);
        }

        //
        exists.holding.forEach((hm) => {
            if (hm.shifting) {
                hm.shifting[0] += np.movement[0];
                hm.shifting[1] += np.movement[1];
                hm.modified = [...hm.shifting];
            }
        });

        //
        //callByFrame(ev.pointerId, ()=>{
            exists?.holding?.forEach((hm) => {
                if (hm.modified && Math.hypot(...np.movement) >= 0.001) {
                    //
                    const nev = new CustomEvent("m-dragging", {
                        bubbles: true,
                        detail: {
                            pointer: exists,
                            holding: hm,
                        },
                    });

                    //
                    const em = hm.element?.deref();
                    em?.dispatchEvent?.(nev);

                    //
                    if (em) {
                        em[`@data-${hm.propertyName || "drag"}-x`] = hm.modified[0];
                        em[`@data-${hm.propertyName || "drag"}-y`] = hm.modified[1];
                    }

                    //
                    setProperty(em,
                        `--${hm.propertyName || "drag"}-x`,
                        hm.modified[0] as unknown as string
                    );
                    setProperty(em,
                        `--${hm.propertyName || "drag"}-y`,
                        hm.modified[1] as unknown as string
                    );
                }
            });
        //});

        //
        ["left", "top", "right", "bottom"].forEach((side) => {
            if (exists?.edges?.results?.[side] != exists?.edges?.[side]) {
                const nev = new CustomEvent(
                    (exists.edges?.[side] ? "m-contact-" : "m-leave-") + side,
                    {detail: exists}
                );
                document?.dispatchEvent?.(nev);
            }
        });
    },
    {capture: true}
);

//
export const releasePointer = (ev) => {
    const exists = pointerMap.get(ev.pointerId);

    //
    if (exists) {
        //
        const preventClick = (e: PointerEvent | MouseEvent) => {
            // @ts-ignore
            if (e?.pointerId == ev.pointerId) {
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();

                //
                document.documentElement.removeEventListener("click", ...doc);
                document.documentElement.removeEventListener("contextmenu", ...doc);

                // @ts-ignore
                ev?.target?.removeEventListener?.("click", ...emt);

                // @ts-ignore
                ev?.target?.removeEventListener?.("contextmenu", ...emt);
            }
        };

        //
        const emt: [(e: PointerEvent | MouseEvent) => any, AddEventListenerOptions] = [preventClick, {once: true}];
        const doc: [(e: PointerEvent | MouseEvent) => any, AddEventListenerOptions] = [preventClick, {once: true, capture: true}];

        //
        if ((exists.holding?.length || 0) > 0) {
            //ev.stopImmediatePropagation();
            //ev.stopPropagation();
            ev.preventDefault();

            //
            {
                document.documentElement.addEventListener("click", ...doc);
                document.documentElement.addEventListener("contextmenu", ...doc);
            }

            //
            setTimeout(() => {
                document.documentElement.removeEventListener("click", ...doc);
                document.documentElement.removeEventListener("contextmenu", ...doc);
            }, 100);
        }

        //
        (exists.holding || []).forEach((hm) => {
            const em = hm.element?.deref();

            //
            if (Math.hypot(...(hm.shifting || [0])) > 10 && em) {
                em?.addEventListener?.("click", ...emt);
                em?.addEventListener?.("contextmenu", ...emt);

                //
                setTimeout(() => {
                    em?.removeEventListener?.("click", ...emt);
                    em?.removeEventListener?.("contextmenu", ...emt);
                }, 100);
            }

            //
            const nev = new CustomEvent("m-dragend", {
                bubbles: true,
                detail: {
                    pointer: exists,
                    holding: hm,
                },
            });
            em?.dispatchEvent?.(nev);
            em?.releasePointerCapture?.(ev.pointerId);
        });

        //
        exists.holding = [];
        pointerMap.delete(ev.pointerId);
    }
};

//
document.documentElement.addEventListener("pointercancel", releasePointer, {capture: true,});
document.documentElement.addEventListener("pointerup"    , releasePointer, {capture: true,});

//
export const grabForDrag = (
    element,
    ev: EvStub = {pointerId: 0},
    {
        shifting = [0, 0],
        propertyName = "drag", // use dragging events for use limits
    } = {}
) => {
    const exists = pointerMap.get(ev.pointerId);
    if (exists) {
        exists.event = ev;

        //
        const ex = (exists.holding || []).find((hm) =>
            hm.element?.deref?.() == element &&
            hm.propertyName == propertyName
        );

        //
        const prop: any = Object.assign(ex || {}, {
            propertyName,
            element: new WeakRef(element),
            shifting: [...(shifting || ex?.shifting || ex?.modified || [])],
        })

        //
        if (!ex) (exists.holding || []).push(prop);

        // pls, assign "ev.detail.holding.shifting" to initial value (f.e. "ev.detail.holding.modified")
        // note about "ev.detail.holding.element is WeakRef, so use ".deref()"
        const nev = new CustomEvent("m-dragstart", {
            bubbles: true,
            detail: {
                pointer: exists,
                holding: prop,
            },
        });

        //
        element?.dispatchEvent?.(nev);

        //
        if (ev?.pointerId != null && ev?.pointerId >= 0) {
            // @ts-ignore
            ev?.target?.setPointerCapture?.(ev?.pointerId);
        }
    }
};
