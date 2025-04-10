import { grabForDrag, setProperty, importCdn } from "./PointerAPI";

// @ts-ignore
const { fixedClientZoom, orientOf, getBoundingOrientRect, agWrapEvent } = await Promise.try(importCdn, ["/externals/core/agate.js"]);

//
interface InteractStatus { pointerId?: number; };

//
const borderBoxWidth  = Symbol("@border-box-width") , borderBoxHeight  = Symbol("@border-box-height");
const contentBoxWidth = Symbol("@content-box-width"), contentBoxHeight = Symbol("@content-box-height");

//
const onBorderObserve  = new WeakMap<HTMLElement, ResizeObserver>();
const onContentObserve = new WeakMap<HTMLElement, ResizeObserver>();

//
const clamp = (min, val, max) => Math.max(min, Math.min(val, max));
const bbw = (el, orient = null)=> ((orient??orientOf(el))%2 ? el[borderBoxHeight]  : el[borderBoxWidth]);
const bbh = (el, orient = null)=> ((orient??orientOf(el))%2 ? el[borderBoxWidth]   : el[borderBoxHeight]);
const cbw = (el, orient = null)=> ((orient??orientOf(el))%2 ? el[contentBoxHeight] : el[contentBoxWidth]);
const cbh = (el, orient = null)=> ((orient??orientOf(el))%2 ? el[contentBoxWidth]  : el[contentBoxHeight]);

/*
const tpm = (callback: (p0: Function, p1: Function) => {}, timeout = 1000) => {
    return new Promise((resolve, reject) => {
        // Set up the timeout
        const timer = setTimeout(() => {
            reject(new Error(`Promise timed out after ${timeout} ms`));
        }, timeout);

        // Set up the real work
        callback(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
};*/

//
const getPxValue = (element, name)=>{
    if ("computedStyleMap" in element) {
        const cm = element?.computedStyleMap();
        return cm.get(name)?.value || 0;
    } else
    if (element instanceof HTMLElement) {
        const cs = getComputedStyle(element, "");
        return (parseFloat(cs.getPropertyValue(name)?.replace?.("px", "")) || 0);
    }
    return 0;
}

//
const doContentObserve = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!onContentObserve.has(element)) {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    const contentBoxSize = entry.contentBoxSize[0];
                    if (contentBoxSize) {
                        element[contentBoxWidth]  = (contentBoxSize.inlineSize + (getPxValue(element, "padding-left") + getPxValue(element, "padding-right" ))) * fixedClientZoom(element);
                        element[contentBoxHeight] = (contentBoxSize.blockSize  + (getPxValue(element, "padding-top")  + getPxValue(element, "padding-bottom"))) * fixedClientZoom(element);
                    }
                }
            }
        });

        //
        element[contentBoxWidth]  = (element.clientWidth ) * fixedClientZoom(element);
        element[contentBoxHeight] = (element.clientHeight) * fixedClientZoom(element);

        //
        onContentObserve.set(element, observer);
        observer.observe(element, {box: "content-box"});
    }
};

//
const doBorderObserve = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!onBorderObserve.has(element)) {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.borderBoxSize) {
                    const borderBoxSize = entry.borderBoxSize[0];
                    if (borderBoxSize) {
                        element[borderBoxWidth]  = borderBoxSize.inlineSize * fixedClientZoom(element);
                        element[borderBoxHeight] = borderBoxSize.blockSize  * fixedClientZoom(element);
                    }
                }
            }
        });

        //
        element[borderBoxWidth]  = element.offsetWidth  * fixedClientZoom(element);
        element[borderBoxHeight] = element.offsetHeight * fixedClientZoom(element);

        //
        onBorderObserve.set(element, observer);
        observer.observe(element, {box: "border-box"});
    }
}

//
const ROOT = document.documentElement;

//
const blockClickTrigger = (_: MouseEvent | PointerEvent | TouchEvent | null = null)=>{
    const blocker = (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        //
        ROOT.removeEventListener("click", blocker, options);
        ROOT.removeEventListener("contextmenu", blocker, options);
    };

    //
    const options = { once: true, capture: true };
    ROOT.addEventListener("click", blocker, options);
    ROOT.addEventListener("contextmenu", blocker, options);

    //
    setTimeout(()=>{
        ROOT.removeEventListener("click", blocker, options);
        ROOT.removeEventListener("contextmenu", blocker, options);
    }, 100);
}

//
export class AxGesture {
    #holder: HTMLElement;
    constructor(holder) {
        if (!holder) {
            throw Error("Element is null...");
        }

        //
        this.#holder = holder;
        this.#holder["@control"] = this;

        //
        const weak = new WeakRef(this);
        const updSize_w = new WeakRef(this.#updateSize);

        //
        doBorderObserve(this.#holder);
        if (this.#parent) {
            doContentObserve(this.#parent);
        }

        //
        ROOT.addEventListener("scaling", ()=>{
            const self = weak?.deref?.();
            try { updSize_w?.deref?.call?.(self); } catch(e) {};
        });
    }

    //
    #updateSize() {
        this.#holder[borderBoxWidth]  = this.#holder.offsetWidth  * fixedClientZoom(this.#holder);
        this.#holder[borderBoxHeight] = this.#holder.offsetHeight * fixedClientZoom(this.#holder);
        if (this.#parent) {
            const parent = this.#parent as HTMLElement;
            parent[contentBoxWidth]  = (parent.clientWidth ) * fixedClientZoom(parent);
            parent[contentBoxHeight] = (parent.clientHeight) * fixedClientZoom(parent);
        }
    }

    //
    swipe(options) {
        if (options?.handler) {
            //
            const swipes = new Map<number, any>([]);
            const swipes_w = new WeakRef(swipes);

            //
            ROOT.addEventListener("pointerdown", agWrapEvent((evc) => {
                const ev = evc?.detail ?? evc;
                if (ev.target == options?.handler) {
                    swipes?.set(ev.pointerId, {
                        target: ev.target,
                        start: [...(ev.client || [ev?.clientX, ev?.clientY])],
                        current: [...(ev.client || [ev?.clientX, ev?.clientY])],
                        pointerId: ev.pointerId,
                        startTime: performance.now(),
                        time: performance.now(),
                        speed: 0,
                    });

                    // stronger policy now...
                    // @ts-ignore
                    ev?.capture?.();
                }
            }));

            //
            const registerMove = (evc) => {
                const ev = evc?.detail ?? evc;
                if (swipes?.has?.(ev.pointerId)) {
                    ev.stopPropagation();
                    const swipe = swipes?.get?.(ev.pointerId);
                    Object.assign(swipe || {}, {
                        //speed: (swipe.speed == 0 ? speed : (speed * 0.8 + swipe.speed * 0.2)),
                        current: [...(ev.client || [ev?.clientX, ev?.clientY])],
                        pointerId: ev.pointerId,
                        time: performance.now(),
                    });
                }
            };

            //
            const compAngle = (a, c) => {
                return ((a - c + 540) % 360) - 180;
            };

            //
            const completeSwipe = (pointerId) => {
                if (swipes?.has?.(pointerId)) {
                    const swipe = swipes_w?.deref()?.get?.(pointerId);
                    const diffP = [
                        swipe.start[0] - swipe.current[0],
                        swipe.start[1] - swipe.current[1],
                    ];
                    const diffT = performance.now() - swipe.startTime;

                    //
                    const speed = Math.hypot(...diffP) / diffT;
                    swipe.speed = speed;

                    //
                    if (swipe.speed > (options.threshold || 0.5)) {
                        const swipeAngle = Math.atan2(
                            swipe.current[1] - swipe.start[1],
                            swipe.current[0] - swipe.start[0]
                        );
                        swipe.swipeAngle = swipeAngle;
                        swipe.direction = "name";

                        //
                        if (
                            Math.abs(
                                compAngle(swipe.swipeAngle * (180 / Math.PI), 0)
                            ) <= 20
                        ) {
                            //AR.get(el.getAttribute("data-swipe-action-left"))?.(el);
                            swipe.direction = "left";
                        }

                        if (
                            Math.abs(
                                compAngle(
                                    swipe.swipeAngle * (180 / Math.PI),
                                    180
                                )
                            ) <= 20
                        ) {
                            //AR.get(el.getAttribute("data-swipe-action-right"))?.(el);
                            swipe.direction = "right";
                        }

                        if (
                            Math.abs(
                                compAngle(
                                    swipe.swipeAngle * (180 / Math.PI),
                                    270
                                )
                            ) <= 20
                        ) {
                            //AR.get(el.getAttribute("data-swipe-action-up"))?.(el);
                            swipe.direction = "up";
                        }

                        if (
                            Math.abs(
                                compAngle(
                                    swipe.swipeAngle * (180 / Math.PI),
                                    90
                                )
                            ) <= 20
                        ) {
                            //AR.get(el.getAttribute("data-swipe-action-down"))?.(el);
                            swipe.direction = "down";
                        }

                        options?.trigger?.(swipe);
                    }
                    swipes_w?.deref()?.delete?.(pointerId);
                }
            };

            //
            ROOT.addEventListener("pointermove", registerMove, {capture: true});
            ROOT.addEventListener("pointerup", (ev) => completeSwipe(ev.pointerId), {capture: true});
            ROOT.addEventListener("pointercancel", (ev) => completeSwipe(ev.pointerId), {capture: true});
        }
    }

    //
    limitResize(real, virtual, holder, container) {
        //const box = this.#holder.getBoundingClientRect();
        const box    = getBoundingOrientRect(holder) || holder?.getBoundingClientRect?.();
        const widthDiff  = cbw(container) - (bbw(holder) - (this.propGet("--resize-x") || 0) + ((box.left || 0) * fixedClientZoom(this.#holder)));
        const heightDiff = cbh(container) - (bbh(holder) - (this.propGet("--resize-y") || 0) + ((box.top  || 0) * fixedClientZoom(this.#holder)));

        // if relative of un-resized to edge corner max-size
        // discount of dragging offset!
        real[0] = clamp(0, virtual[0], widthDiff);
        real[1] = clamp(0, virtual[1], heightDiff);

        //
        return real;
    }

    //
    get #parent() {
        // @ts-ignore
        return this.#holder.offsetParent ?? this.#holder?.host ?? ROOT;
    }

    //
    resizable(options) {
        const handler = options.handler ?? this.#holder;
        const status: InteractStatus = { pointerId: -1 };
        const weak = new WeakRef(this.#holder);
        const self_w = new WeakRef(this);
        const upd_w = new WeakRef(this.#updateSize);

        //
        handler.addEventListener("pointerdown", agWrapEvent((evc) => {
            const self = self_w?.deref();
            const ev = evc?.detail || evc;

            //
            status.pointerId = ev.pointerId; try { upd_w?.deref?.call?.(self); } catch(e) {};
            const starting = [self?.propGet?.("--resize-x") || 0, self?.propGet?.("--resize-y") || 0];
            const holder = weak?.deref?.() as any;
            const parent = holder?.offsetParent ?? holder?.host ?? ROOT;

            //
            if (holder) {
                holder.style.setProperty("will-change", "contents, inline-size, block-size, width, height, transform", "important");
                grabForDrag(holder, ev, {
                    propertyName: "resize",
                    shifting: self?.limitResize?.(starting, starting, holder, parent),
                });
            }

            //
            ev?.capture?.(self);
            // @ts-ignore
            //ev.target?.setPointerCapture?.(ev.pointerId);
        }));

        //
        this.#holder.addEventListener(
            "m-dragend",
            (evc) => {
                const self   = self_w?.deref?.();
                const holder = weak?.deref?.() as any;
                const dt = evc?.detail ?? evc; evc?.target?.style.removeProperty("will-change");
                if (dt.holding.propertyName == "resize") {
                    status.pointerId = -1;
                    //this.#resizeMute = false;
                }
            },
            {capture: true, passive: false}
        );
    }

    //
    draggable(options) {
        const handler = options.handler ?? this.#holder;
        const status: InteractStatus = {
            pointerId: -1,
        };

        //
        const weak   = new WeakRef(this.#holder);
        const self_w = new WeakRef(this);
        const upd_w  = new WeakRef(this.#updateSize);

        //
        handler.addEventListener("pointerdown", agWrapEvent((evc) => {
            const ev = evc?.detail || evc;
            status.pointerId = ev.pointerId;

            //
            let trigger = false;
            const holder = weak?.deref?.() as any;
            if (holder) {
                holder.style.setProperty("will-change", "transform", "important");
            }

            //
            const shiftEv: [any, any] = [(evp) => {
                if ((evp?.detail || evp).pointerId == ev.pointerId && !trigger) {
                    trigger = true;
                    unListenShift();

                    //
                    const holder = weak?.deref?.() as any;
                    if (holder) {
                        const self = self_w?.deref?.();
                        try { upd_w?.deref?.call?.(self); } catch(e) {};
                        const starting = [0, 0]
                        grabForDrag(holder, (evp?.detail || evp), {
                            propertyName: "drag",
                            shifting: starting
                        });
                    }
                }
            }, {once: true}];

            //
            const unListenShift = (evp?) => {
                if (!evp || (evp?.detail || evp)?.pointerId == ev.pointerId) {
                    //const holder = weak?.deref?.() as any;
                    ROOT.removeEventListener("pointermove"  , ...shiftEv);
                    ROOT.removeEventListener("pointerup"    , unListenShift);
                    ROOT.removeEventListener("pointercancel", unListenShift);
                }
            };

            //
            ROOT.addEventListener("pointermove"  , ...shiftEv);
            ROOT.addEventListener("pointerup"    , unListenShift);
            ROOT.addEventListener("pointercancel", unListenShift);
        }));

        //
        const cancelShift = agWrapEvent((evc)=>{
            const ev = evc?.detail || evc;
            //
            if ((ev.type?.includes?.("pointercancel") || ev.type?.includes?.("pointerup")) && status.pointerId == ev?.pointerId) {
                // @ts-ignore
                //ev.target?.releasePointerCapture?.(ev.pointerId);
                status.pointerId = -1;

                //
                const holder = weak?.deref?.() as any;
                holder?.style?.removeProperty?.("will-change");
            }
        });

        //
        ROOT.addEventListener("pointerup"    , cancelShift);
        ROOT.addEventListener("pointercancel", cancelShift);

        //
        this.#holder.addEventListener("m-dragend", (evc) => {
            const holder = weak?.deref?.() as any;
            const box    = getBoundingOrientRect(holder) || holder?.getBoundingClientRect?.();

            //
            setProperty(holder, "--shift-x", (box?.left || 0) - Math.max(this.propGet("--resize-x") || 0, 0) * 0.5 - (this.#parent[contentBoxWidth ] - this.#holder[borderBoxWidth ]) * 0.5);
            setProperty(holder, "--shift-y", (box?.top  || 0) - Math.max(this.propGet("--resize-y") || 0, 0) * 0.5 - (this.#parent[contentBoxHeight] - this.#holder[borderBoxHeight]) * 0.5);

            //
            setProperty(holder, "--drag-x", 0);
            setProperty(holder, "--drag-y", 0);
        });
    }

    //
    propGet(name) {
        const prop = this.#holder.style.getPropertyValue(name);
        const num = prop != null && prop != "" ? parseFloat(prop) || 0 : null;
        return num || null;
    }

    //
    propFloat(name, val) {
        setProperty(this.#holder, name, val);
    }


    //
    longHover(options, fx = (ev) => {
        ev.target.dispatchEvent(
            new CustomEvent("long-hover", {detail: ev?.detail || ev, bubbles: true})
        );
    }) {
        //const handler = options.handler || this.#holder;
        const action: any = { pointerId: -1, timer: null };
        const initiate = agWrapEvent((evc)=>{
            const ev = evc?.detail || evc;
            if ((ev.target.matches(options.selector) || ev.target.closest(options.selector)) && action.pointerId < 0) {
                action.pointerId = ev.pointerId;
                action.timer = setTimeout(()=>{
                    fx?.(ev);
                    if (matchMedia("(pointer: coarse) and (hover: none)").matches) {
                        blockClickTrigger(evc);
                    }
                }, options.holdTime ?? 300);
            }
        });

        //
        const cancelEv = agWrapEvent((evc)=>{
            const ev = evc?.detail || evc;
            if ((ev.target.matches(options.selector) || ev.target.closest(options.selector)) && action.pointerId == ev.pointerId) {
                if (action.timer) { clearTimeout(action.timer); };

                //
                action.timer   = null;
                action.pointerId = -1;
            }
        });

        //
        ROOT.addEventListener("pointerover"  , initiate);
        ROOT.addEventListener("pointerdown"  , initiate);
        ROOT.addEventListener("pointerout"   , cancelEv);
        ROOT.addEventListener("pointerup"    , cancelEv);
        ROOT.addEventListener("pointercancel", cancelEv);
    }

    //
    private holding: any = {
        fx: null,
        options: {},
        actionState: {}
    }

    //
    defaultHandler(ev, weakRef: WeakRef<HTMLElement>) {
        return weakRef?.deref()?.dispatchEvent?.(new CustomEvent("long-press", {detail: ev?.detail || ev, bubbles: true}));
    }

    //
    longPress(options: any = {}, fx?: (ev: PointerEvent) => void) {
        const weakRef = new WeakRef(this.#holder);
        const actionState = this.initializeActionState();

        //
        this.holding = {
            actionState,
            options, fx: fx || ((ev) => this.defaultHandler(ev, weakRef))
        }

        //
        const ROOT = document.documentElement;

        // Event listeners
        const pointerDownListener = (ev: PointerEvent) => this.onPointerDown(this.holding, ev, weakRef);
        const pointerMoveListener = (ev: PointerEvent) => this.onPointerMove(this.holding, ev);
        const pointerUpListener   = (ev: PointerEvent) => this.onPointerUp(this.holding, ev);

        //
        ROOT.addEventListener("pointerdown", pointerDownListener, { passive: false });
        ROOT.addEventListener("pointermove", pointerMoveListener, { passive: true });
        ROOT.addEventListener("pointerup", pointerUpListener, { passive: true });
    }

    //
    private initializeActionState() {
        return {
            timerId: null,
            immediateTimerId: null,
            pointerId: -1,
            startCoord: [0, 0] as [number, number],
            lastCoord: [0, 0] as [number, number],
            isReadyForLongPress: false,
            cancelCallback: () => {},
            cancelPromiseResolver: null as (() => void) | null,
            cancelPromiseRejector: null as ((reason?: any) => void) | null,
        };
    }

    //
    private onPointerDown(self: any, ev: PointerEvent, weakRef: WeakRef<HTMLElement>) {
        if (
            !this.isValidTarget(self, ev.target as HTMLElement, weakRef) ||
            !(self.options.anyPointer || ev?.pointerType == "touch")
        ) return;

        //
        ev.preventDefault();

        // Initialize state
        const { actionState }  = self;
        actionState.pointerId  = ev.pointerId;
        actionState.startCoord = [ev.clientX, ev.clientY];
        actionState.lastCoord  = [...actionState.startCoord];

        // Set up cancellation promise
        const cancelPromise = new Promise<void>((resolve, reject) => {
            actionState.cancelPromiseResolver = resolve;
            actionState.cancelPromiseRejector = reject;
            actionState.cancelCallback = () => {
                clearTimeout(actionState.timerId!);
                clearTimeout(actionState.immediateTimerId!);
                actionState.isReadyForLongPress = false;
                resolve();
                this.resetAction(actionState);
            };
        });

        // Immediate trigger timer
        if (self.options.mouseImmediate && ev.pointerType === "mouse") {
            self.fx?.(ev);
            return actionState.cancelCallback();
        }

        // Long press timer
        actionState.timerId = setTimeout(() => {
            actionState.isReadyForLongPress = true;
        }, self.options.minHoldTime ?? 300);

        // Start timers for long press and immediate actions
        actionState.immediateTimerId = setTimeout(() => {
            if (this.isInPlace(self)) {
                self.fx?.(ev);
                actionState.cancelCallback();
            }
        }, self.options.maxHoldTime ?? 600);

        // Cancel promise handling
        Promise.race([
            cancelPromise,
            new Promise<void>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 5000)
            ),
        ]).catch(console.warn);
    }

    //
    private onPointerMove(self: any, ev: PointerEvent) {
        const {actionState} = self;
        if (ev.pointerId !== actionState.pointerId) return;
        actionState.lastCoord = [ev.clientX, ev.clientY];

        if (!this.isInPlace(self)) {
            actionState.cancelCallback();
        }
    }

    //
    private resetAction(actionState) {
        actionState.pointerId               = -1;
        actionState.cancelPromiseResolver   = null;
        actionState.cancelPromiseRejector   = null;
        actionState.isReadyForLongPress     = false;
        actionState.cancelCallback          = null;
    }

    //
    private onPointerUp(self: any, ev: PointerEvent) {
        const {actionState} = self;
        if (ev.pointerId !== actionState.pointerId) return;

        const [x, y] = [ev.clientX, ev.clientY];
        actionState.lastCoord = [x, y];

        if (actionState.isReadyForLongPress && this.isInPlace(self)) {
            self.fx?.(ev);
            blockClickTrigger(ev);
        }

        actionState.cancelCallback();
    }

    private hasParent(current, parent) {
        while (current) {
            if (current === parent) return true;
            current = current.parentElement;
        }
    }

    private isValidTarget(self: any, target: HTMLElement, weakRef: WeakRef<HTMLElement>): boolean|null|undefined {
        const weakElement = weakRef?.deref?.();//new WeakRef(this.#holder).deref();

        // Check for valid target based on options and hierarchy
        return (
            weakElement && (this.hasParent(target, weakElement) || target === weakElement) &&
            (!self.options.handler || target.matches(self.options.handler))
        );
    }

    private isInPlace(self: any): boolean {
        const {actionState}    = self;
        const [startX, startY] = actionState.startCoord;
        const [lastX, lastY]   = actionState.lastCoord;
        const distance         = Math.hypot(lastX - startX, lastY - startY);
        return distance <= (self.options.maxOffsetRadius ?? 10);
    }

}

//
export default AxGesture;
