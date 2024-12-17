// @ts-ignore
import { fixedClientZoom, orientOf, getBoundingOrientRect } from "/externals/core/agate.js";
import { grabForDrag, setProperty } from "./PointerAPI";
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
};

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
            ROOT.addEventListener("ag-pointerdown", (evc) => {
                const ev = evc?.detail ?? evc;
                if (ev.target == options?.handler) {
                    swipes?.set(ev.pointerId, {
                        target: ev.target,
                        start: [...(ev.orient || [ev?.clientX, ev?.clientY])],
                        current: [...(ev.orient || [ev?.clientX, ev?.clientY])],
                        pointerId: ev.pointerId,
                        startTime: performance.now(),
                        time: performance.now(),
                        speed: 0,
                    });

                    // stronger policy now...
                    // @ts-ignore
                    ev?.capture?.();
                }
            });

            //
            const registerMove = (evc) => {
                const ev = evc?.detail ?? evc;
                if (swipes?.has?.(ev.pointerId)) {
                    ev.stopPropagation();
                    const swipe = swipes?.get?.(ev.pointerId);
                    Object.assign(swipe || {}, {
                        //speed: (swipe.speed == 0 ? speed : (speed * 0.8 + swipe.speed * 0.2)),
                        current: [...(ev.orient || [ev?.clientX, ev?.clientY])],
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
            ROOT.addEventListener("ag-pointermove", registerMove, {capture: true});
            ROOT.addEventListener("ag-pointerup", (ev) => completeSwipe(ev.pointerId), {capture: true});
            ROOT.addEventListener("ag-pointercancel", (ev) => completeSwipe(ev.pointerId), {capture: true});
        }
    }

    //
    limitResize(real, virtual, holder, container) {
        //const box = this.#holder.getBoundingClientRect();
        const widthDiff  = cbw(container) - (bbw(holder) - (this.propGet("--resize-x") || 0) + ((this.#holder.offsetLeft || 0) * fixedClientZoom(this.#holder)));
        const heightDiff = cbh(container) - (bbh(holder) - (this.propGet("--resize-y") || 0) + ((this.#holder.offsetTop  || 0) * fixedClientZoom(this.#holder)));

        // if relative of un-resized to edge corner max-size
        // discount of dragging offset!
        real[0] = clamp(0, virtual[0], widthDiff);
        real[1] = clamp(0, virtual[1], heightDiff);

        //
        return real;
    }

    //
    limitDrag(real, virtual, holder, container, shift: [number, number] = [0, 0]) {
        const widthDiff  = cbw(container) - bbw(holder);
        const heightDiff = cbh(container) - bbh(holder);

        // if centered
        //real[0] = clamp(-widthDiff * 0.5, virtual[0], widthDiff * 0.5);
        //real[1] = clamp(-heightDiff * 0.5, virtual[1], heightDiff * 0.5);

        // if origin in top-left
        real[0] = clamp(0, virtual[0] + shift[0], widthDiff)  - shift[0];
        real[1] = clamp(0, virtual[1] + shift[1], heightDiff) - shift[1];

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
        const hasOB  = handler.closest("ui-orientbox");

        //
        handler.addEventListener(hasOB ? "ag-pointerdown" : "pointerdown", (evc) => {
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
        });

        //
        this.#holder.addEventListener(
            "m-dragging",
            (evc) => {
                const holder = weak?.deref?.() as any;
                const dt     = evc?.detail ?? evc;

                //
                if (
                    holder &&
                    dt.event.pointerId == status.pointerId &&
                    dt.holding.propertyName == "resize" &&
                    dt.holding.element.deref() == holder
                ) {
                    const self   = self_w?.deref?.();
                    const parent = holder?.offsetParent ?? holder?.host ?? ROOT;
                    self?.limitResize?.(
                        dt.holding.modified,
                        dt.holding.shifting,
                        holder,
                        parent
                    );
                }
            },
            {capture: true, passive: false}
        );

        //
        this.#holder.addEventListener(
            "m-dragend",
            (evc) => {
                const dt = evc?.detail ?? evc; evc?.target?.style.removeProperty("will-change");
                if (dt.holding.propertyName == "resize") {
                    status.pointerId = -1;
                    //this.#resizeMute = false;
                }
            },
            {capture: true, passive: false}
        );
    }

    // OBSOLETE! Due of critical issues...
    draggable(options) {
        const handler = options.handler ?? this.#holder;
        const status: InteractStatus = {
            pointerId: -1,
        };

        //
        const weak   = new WeakRef(this.#holder);
        const self_w = new WeakRef(this);
        const upd_w  = new WeakRef(this.#updateSize);
        const hasOB  = handler.closest("ui-orientbox");

        //
        handler.addEventListener(hasOB ? "ag-pointerdown" : "pointerdown", (evc) => {
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
        });

        //
        const cancelShift = (evc)=>{
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
        }

        //
        ROOT.addEventListener(hasOB ? "ag-pointerup"     : "pointerup", cancelShift);
        ROOT.addEventListener(hasOB ? "ag-pointercancel" : "pointercancel", cancelShift);

        //
        this.#holder.addEventListener("m-dragend", (evc) => {
            const holder = weak?.deref?.() as any;
            const box    = getBoundingOrientRect(holder) || holder?.getBoundingClientRect?.();

            //
            setProperty(holder, "--shift-x", box?.left || 0);
            setProperty(holder, "--shift-y", box?.top  || 0);

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
        const initiate = (evc)=>{
            const ev = evc?.detail || evc;
            if ((ev.target.matches(options.selector) || ev.target.closest(options.selector)) && action.pointerId < 0) {
                action.pointerId = ev.pointerId;
                action.timer = setTimeout(()=>{
                    fx?.(ev);
                    if (matchMedia("(pointer: coarse) and (hover: none)").matches) {
                        blockClickTrigger();
                    }
                }, options.holdTime ?? 300);
            }
        }

        //
        const cancelEv = (evc)=>{
            const ev = evc?.detail || evc;
            if ((ev.target.matches(options.selector) || ev.target.closest(options.selector)) && action.pointerId == ev.pointerId) {
                if (action.timer) { clearTimeout(action.timer); };

                //
                action.timer   = null;
                action.pointerId = -1;
            }
        }

        //
        ROOT.addEventListener("ag-pointerover"  , initiate);
        ROOT.addEventListener("ag-pointerdown"  , initiate);
        ROOT.addEventListener("ag-pointerout"   , cancelEv);
        ROOT.addEventListener("ag-pointerup"    , cancelEv);
        ROOT.addEventListener("ag-pointercancel", cancelEv);
    }


    //
    longPress(
        options: any = {},
        fx: any = null
    ) {
        //
        const weak   = new WeakRef(this.#holder);

        //
        fx ||= (ev) => {
            weak?.deref()?.dispatchEvent(new CustomEvent("long-press", {detail: ev?.detail || ev, bubbles: true}));
            //requestAnimationFrame(()=>navigator?.vibrate?.([10]))
        }

        //
        const action: any = {
            timer: null,
            cancelPromise: null,
            imTimer: null,
            pointerId: -1,
            pageCoord: [0, 0],
            lastCoord: [0, 0],
            ready: false,
            cancelRv: () => {}
        };

        //
        const prepare = (resolve, action, ev) => {
            return async () => {
                if (action.pointerId == ev.pointerId) resolve?.();
            };
        };

        //
        const inPlace = () => {
            return (
                Math.hypot(
                    ...action.lastCoord.map(
                        (n, i) => (action?.pageCoord?.[i] || 0) - n
                    )
                ) <= (options?.maxOffsetRadius ?? 10)
            );
        };

        //
        const immediate = (resolve, action, ev) => {
            return async () => {
                if (action.pointerId == ev.pointerId) {
                    if (inPlace()) {
                        resolve?.();

                        //
                        fx?.(ev);
                        blockClickTrigger(ev);
                    }
                    action.cancelRv?.();
                }
            };
        };

        //
        const forMove: [any, any] = [null, {capture: true}];
        const forCanc: [any, any] = [null, {capture: true}];
        const registerCoord: [any, any] = [
            (evc) => {
                const ev = evc?.detail || evc;
                if (ev.pointerId == action.pointerId) {
                    action.lastCoord[0] = ev?.orient[0] || ev?.clientX;
                    action.lastCoord[1] = ev?.orient[1] || ev?.clientY;
                }
            },
            {capture: true, passive: true},
        ];

        //
        const triggerOrCancel: any = (evc) => {
            const ev = evc?.detail || evc;
            if (ev.pointerId == action.pointerId) {
                action.lastCoord[0] = ev?.orient[0] || ev?.clientX;
                action.lastCoord[1] = ev?.orient[1] || ev?.clientY;

                //
                evc?.preventDefault();
                evc?.stopPropagation();

                // JS math logic megalovania...
                if (action.ready) {
                    immediate(null, action, ev);
                } else {
                    action.cancelRv?.();
                }
            }
        };

        //
        const cancelWhenMove: any = (evc) => {
            const ev = evc?.detail || evc;
            if (ev.pointerId == action.pointerId) {
                action.lastCoord[0] = ev?.orient[0] || ev?.clientX;
                action.lastCoord[1] = ev?.orient[1] || ev?.clientY;

                //
                evc?.preventDefault();
                evc?.stopPropagation();

                // JS math logic megalovania...
                if (!inPlace()) {
                    action.cancelRv?.();
                }
            }
        };

        //
        forCanc[0] = triggerOrCancel;
        forMove[0] = cancelWhenMove;

        //
        ROOT.addEventListener(
            "ag-pointerdown",
            (evc) => {
                const ev = evc?.detail ?? evc;
                if (
                    (weak?.deref()?.contains(ev?.target as HTMLElement) && (options.handler ? (ev?.target as HTMLElement).matches(options.handler) : false) || (ev?.target == weak?.deref())) &&
                    action.pointerId < 0 &&
                    (options.anyPointer || ev?.pointerType == "touch")
                ) {
                    evc?.preventDefault?.();
                    evc?.stopPropagation?.();

                    //
                    action.pageCoord = [...(ev?.orient || [ev?.clientX, ev?.clientY])];
                    action.lastCoord = [...(ev?.orient || [ev?.clientX, ev?.clientY])];
                    action.pointerId = ev.pointerId;

                    //
                    const cancelPromiseWithResolve = Promise.withResolvers();
                    action.cancelPromise = cancelPromiseWithResolve.promise;
                    action.cancelRv = () => {
                        //
                        ROOT.removeEventListener("ag-pointerup", ...forCanc);
                        ROOT.removeEventListener("ag-pointercancel", ...forCanc);
                        ROOT.removeEventListener("ag-pointermove", ...forMove);

                        //
                        clearTimeout(action.timer);
                        clearTimeout(action.imTimer);
                        action.ready = false;
                        action.timer = null;
                        action.imTimer = null;
                        action.cancelRv = null;
                        action.cancelPromise = null;
                        action.pointerId = -1;

                        //
                        cancelPromiseWithResolve.resolve(true);
                    };

                    //
                    if (ev.pointerType == "mouse" && options.mouseImmediate) {
                        fx?.(ev);
                        action?.cancelRv?.();
                    } else {
                        //
                        Promise.any([
                            tpm(
                                (resolve, _) =>
                                (action.timer = setTimeout(
                                    prepare(resolve, action, ev),
                                    options?.minHoldTime ?? 300
                                )),
                                1000 * 5
                            ).then(() => (action.ready = true)),
                            tpm(
                                (resolve, _) =>
                                (action.imTimer = setTimeout(
                                    immediate(resolve, action, ev),
                                    options?.maxHoldTime ?? 600
                                )),
                                1000
                            ),
                            action.cancelPromise,
                        ])
                            .catch(console.warn.bind(console))
                            .then(action.cancelRv);
                    }

                    //
                    ROOT.addEventListener("ag-pointerup", ...forCanc);
                    ROOT.addEventListener("ag-pointercancel", ...forCanc);
                    ROOT.addEventListener("ag-pointermove", ...forMove);
                }
            },
            {passive: false, capture: false}
        );

        //
        ROOT.addEventListener("ag-pointerup", ...registerCoord);
        ROOT.addEventListener("ag-pointercancel", ...registerCoord);
        ROOT.addEventListener("ag-pointermove", ...registerCoord);
    }
}

//
export default AxGesture;
