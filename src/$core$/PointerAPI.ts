// @ts-ignore
import { agWrapEvent } from "/externals/core/agate.js";

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
const clickPrevention = (element, pointerId = 0)=>{
    //
    const preventClick = (e: PointerEvent | MouseEvent | CustomEvent | any) => {
        // @ts-ignore
        if (e?.pointerId == pointerId) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();

            //
            document.documentElement.removeEventListener("click", ...doc);
            document.documentElement.removeEventListener("contextmenu", ...doc);

            //
            element?.removeEventListener?.("click", ...emt);
            element?.removeEventListener?.("contextmenu", ...emt);
        }
    };

    //
    const emt: [(e: PointerEvent | MouseEvent | CustomEvent | any) => any, AddEventListenerOptions] = [preventClick, {once: true}];
    const doc: [(e: PointerEvent | MouseEvent | CustomEvent | any) => any, AddEventListenerOptions] = [preventClick, {once: true, capture: true}];

    //
    {
        document.documentElement.addEventListener("click", ...doc);
        document.documentElement.addEventListener("contextmenu", ...doc);
    }

    {   //
        element?.addEventListener?.("click", ...emt);
        element?.addEventListener?.("contextmenu", ...emt);
    }

    //
    setTimeout(() => {
        element?.removeEventListener?.("click", ...emt);
        element?.removeEventListener?.("contextmenu", ...emt);

        //
        document.documentElement.removeEventListener("click", ...doc);
        document.documentElement.removeEventListener("contextmenu", ...doc);
    }, 100);
}

//
export const pointerMap = new Map([]);
export const grabForDrag = (
    em,
    ex: any = {pointerId: 0},
    {
        shifting = [0, 0],
        propertyName = "drag", // use dragging events for use limits
    } = {}
) => {
    let last: any = ex?.detail || ex;
    let changed: boolean = false;
    let frameTime = 0.01, lastLoop = performance.now(), thisLoop;
    const filterStrength = 100;
    const computeDuration = () => {
        var thisFrameTime = (thisLoop=performance.now()) - lastLoop;
        frameTime += (thisFrameTime - frameTime) / filterStrength;
        lastLoop = thisLoop;
        return frameTime;
    }

    //
    const hm: any = {
        movement: [...(ex?.movement || [0, 0])],
        shifting: [...shifting],
        modified: [...shifting],
        canceled: false,
        duration: frameTime,
        element: new WeakRef(em),
        propertyName,
        origin: null
    };

    //
    const moveEvent = [agWrapEvent((evc)=>{
        const ev = evc?.detail || evc;
        if (ex?.pointerId == ev?.pointerId) {
            if (ev.target != em && !(ev.target.contains(em) || em.contains(ev.target))) { return; };

            //
            evc?.preventDefault?.();
            evc?.stopPropagation?.();
            evc?.stopImmediatePropagation?.();

            //
            ev?.event?.preventDefault?.();
            ev?.event?.stopPropagation?.();
            ev?.event?.stopImmediatePropagation?.();

            //
            hm.movement = [...(ex?.movement || (hm.origin ? [ev.orient[0] - hm.origin[0], ev.orient[1] - hm.origin[1]] : hm.movement))];
            hm.origin   = [...(ev?.orient || [ev?.clientX || 0, ev?.clientY || 0] || [0, 0])];
            hm.shifting[0] += hm.movement[0], hm.shifting[1] += hm.movement[1];
            hm.modified[0]  = hm.shifting[0], hm.modified[1]  = hm.shifting[1];

            //
            last = ev; changed = true;
            em?.dispatchEvent?.(new CustomEvent("m-dragging", {
                bubbles: true,
                detail: {
                    event: last,
                    holding: hm,
                },
            }));
            hm.duration = computeDuration();
        }
    }), {capture: true}];

    //
    const releaseEvent = [agWrapEvent((evc)=>{
        const ev = evc?.detail || evc;
        if (ex?.pointerId == ev?.pointerId) {
            if (ev.target != em && !(ev.target.contains(em) || em.contains(ev.target))) { return; };

            //
            hm.canceled = true;
            em?.removeEventListener?.("pointermove", ...moveEvent);
            em?.removeEventListener?.("pointercancel", ...releaseEvent);
            em?.removeEventListener?.("pointerup", ...releaseEvent);
            em?.removeEventListener?.("click", ...releaseEvent);
            em?.releaseCapturePointer?.(ev?.pointerId);
            ev?.release?.(em);

            //
            changed = false; last = ev; clickPrevention(em, ev?.pointerId);
            em?.dispatchEvent?.(new CustomEvent("m-dragend", {
                bubbles: true,
                detail: {
                    event: last,
                    holding: hm,
                },
            }));
        }
    }), {capture: true}];

    //
    if (em?.dispatchEvent?.(new CustomEvent("m-dragstart", { bubbles: true, detail: { event: last, holding: hm }}))) {
        ex?.capture?.(em);
        em?.setPointerCapture?.(ex?.pointerId);
        em?.addEventListener?.("pointermove", ...moveEvent);
        em?.addEventListener?.("pointercancel", ...releaseEvent);
        em?.addEventListener?.("pointerup", ...releaseEvent);
        em?.addEventListener?.("click", ...releaseEvent);
    } else {
        hm.canceled = true;
    }

    //
    (async ()=>{
        while (!hm.canceled) {

            //
            if (changed) {
                changed = false;

                // time dimension
                setProperty(em,
                    `--${hm.propertyName || "drag"}-d`,
                    0//Math.min(hm.duration, 8)
                );

                // space dimension
                setProperty(em,
                    `--${hm.propertyName || "drag"}-x`,
                    hm.modified[0] as unknown as string
                );
                setProperty(em,
                    `--${hm.propertyName || "drag"}-y`,
                    hm.modified[1] as unknown as string
                );
            }

            //
            await new Promise((r)=>requestAnimationFrame(r));
        }
    })();
};
