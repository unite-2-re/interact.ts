import {zoomOf} from "./Zoom";
import {grabForDrag} from "./PointerAPI";

//
const clamp = (min, val, max) => {
    return Math.max(min, Math.min(val, max));
};

//
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
const borderBoxWidth  = Symbol("@border-box-width");
const borderBoxHeight = Symbol("@border-box-height");

//
const contentBoxWidth  = Symbol("@content-box-width");
const contentBoxHeight = Symbol("@content-box-height");


//
interface InteractStatus {
    pointerId?: number;
}


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
const onBorderObserve = new WeakMap<HTMLElement, ResizeObserver>();
const onContentObserve = new WeakMap<HTMLElement, ResizeObserver>();

//
const doContentObserve = (element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!onContentObserve.has(element)) {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    const contentBoxSize = entry.contentBoxSize[0];
                    if (contentBoxSize) {
                        element[contentBoxWidth]  = (contentBoxSize.inlineSize + (getPxValue(element, "padding-left") + getPxValue(element, "padding-right" ))) * zoomOf();
                        element[contentBoxHeight] = (contentBoxSize.blockSize  + (getPxValue(element, "padding-top")  + getPxValue(element, "padding-bottom"))) * zoomOf();
                    }
                }
            }
        });

        //
        element[contentBoxWidth]  = (element.clientWidth ) * zoomOf();
        element[contentBoxHeight] = (element.clientHeight) * zoomOf();

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
                        element[borderBoxWidth]  = borderBoxSize.inlineSize * zoomOf();
                        element[borderBoxHeight] = borderBoxSize.blockSize * zoomOf();

                        //
                        element.style.setProperty("--border-width" , borderBoxSize.inlineSize + "px");
                        element.style.setProperty("--border-height", borderBoxSize.blockSize  + "px");
                    }
                }
            }
        });

        //
        element[borderBoxWidth]  = element.offsetWidth  * zoomOf();
        element[borderBoxHeight] = element.offsetHeight * zoomOf();

        //
        element.style.setProperty("--border-width" , element.offsetWidth  + "px");
        element.style.setProperty("--border-height", element.offsetHeight + "px");

        //
        onBorderObserve.set(element, observer);
        observer.observe(element, {box: "border-box"});
    }
}

//
const blockClickTrigger = (_: MouseEvent | PointerEvent | TouchEvent | null = null)=>{
    const blocker = (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        //
        document.documentElement.removeEventListener("click", blocker, options);
        document.documentElement.removeEventListener("contextmenu", blocker, options);
    };

    //
    const options = { once: true, capture: true };
    document.documentElement.addEventListener("click", blocker, options);
    document.documentElement.addEventListener("contextmenu", blocker, options);

    //
    setTimeout(()=>{
        document.documentElement.removeEventListener("click", blocker, options);
        document.documentElement.removeEventListener("contextmenu", blocker, options);
    }, 100);
}

//
export default class AxGesture {
    #holder: HTMLElement;
    //#dragStatus: InteractStatus = {pointerId: -1};
    //#resizeStatus: InteractStatus = {pointerId: -1};
    #resizeMute = false;
    //#observer: ResizeObserver;

    //
    constructor(holder) {
        if (!holder) {
            throw Error("Element is null...");
        }

        //
        this.#holder = holder;
        this.#holder["@control"] = this;

        //
        doBorderObserve(this.#holder);
        if (this.#parent) {
            doContentObserve(this.#parent);
        }

        //
        document.documentElement.addEventListener("scaling", ()=>{
            this.#updateSize();
        });
    }

    //
    #updateSize() {
        this.#holder[borderBoxWidth] = this.#holder.offsetWidth * zoomOf();
        this.#holder[borderBoxHeight] = this.#holder.offsetHeight * zoomOf();

        //
        this.#holder.style.setProperty("--border-width" , this.#holder.offsetWidth  + "px");
        this.#holder.style.setProperty("--border-height", this.#holder.offsetHeight + "px");

        //
        if (this.#parent) {
            const parent = this.#parent as HTMLElement;
            parent[contentBoxWidth]  = (parent.clientWidth )  * zoomOf();
            parent[contentBoxHeight] = (parent.clientHeight) * zoomOf();
        }
    }

    //
    swipe(options) {
        if (options?.handler) {
            //
            const swipes = new Map<number, any>([]);

            //
            document.documentElement.addEventListener("pointerdown", (ev) => {
                if (ev.target == options?.handler) {
                    swipes.set(ev.pointerId, {
                        target: ev.target,
                        start: [ev.clientX, ev.clientY],
                        current: [ev.clientX, ev.clientY],
                        pointerId: ev.pointerId,
                        startTime: performance.now(),
                        time: performance.now(),
                        speed: 0,
                    });

                    // stronger policy now...
                    // @ts-ignore
                    ev.target?.setPointerCapture?.(ev.pointerId);
                }
            });

            //
            const registerMove = (ev) => {
                if (swipes.has(ev.pointerId)) {
                    ev.stopPropagation();
                    const swipe = swipes.get(ev.pointerId);
                    Object.assign(swipe || {}, {
                        //speed: (swipe.speed == 0 ? speed : (speed * 0.8 + swipe.speed * 0.2)),
                        current: [ev.clientX, ev.clientY],
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
                if (swipes.has(pointerId)) {
                    const swipe = swipes.get(pointerId);
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
                    swipes.delete(pointerId);
                }
            };

            //
            document.documentElement.addEventListener(
                "pointermove",
                registerMove,
                {capture: true}
            );
            document.documentElement.addEventListener(
                "pointerup",
                (ev) => completeSwipe(ev.pointerId),
                {capture: true}
            );
            document.documentElement.addEventListener(
                "pointercancel",
                (ev) => completeSwipe(ev.pointerId),
                {capture: true}
            );
        }
    }

    //
    limitResize(real, virtual, holder, container) {
        //const box = this.#holder.getBoundingClientRect();
        const widthDiff  = container?.[contentBoxWidth]  - (holder[borderBoxWidth]  - (this.propGet("--resize-x") || 0) + ((this.#holder.offsetLeft || 0) * zoomOf())/*(this.propGet("--drag-x") || 0)*/);
        const heightDiff = container?.[contentBoxHeight] - (holder[borderBoxHeight] - (this.propGet("--resize-y") || 0) + ((this.#holder.offsetTop  || 0) * zoomOf())/*(this.propGet("--drag-y") || 0)*/);

        // if relative of un-resized to edge corner max-size
        // discount of dragging offset!
        real[0] = clamp(0, virtual[0], widthDiff);
        real[1] = clamp(0, virtual[1], heightDiff);

        //
        return real;
    }

    //
    limitDrag(real, virtual, holder, container) {
        const widthDiff  = (container?.[contentBoxWidth]  - holder[borderBoxWidth]);
        const heightDiff = (container?.[contentBoxHeight] - holder[borderBoxHeight]);

        // if centered
        //real[0] = clamp(-widthDiff * 0.5, virtual[0], widthDiff * 0.5);
        //real[1] = clamp(-heightDiff * 0.5, virtual[1], heightDiff * 0.5);

        // if origin in top-left
        real[0] = clamp(0, virtual[0], widthDiff);
        real[1] = clamp(0, virtual[1], heightDiff);

        //
        return real;
    }

    //
    get #parent() {
        // @ts-ignore
        return this.#holder.offsetParent ?? this.#holder?.host ?? document.documentElement;
    }

    //
    resizable(options) {
        const handler = options.handler ?? this.#holder;
        const status: InteractStatus = {
            pointerId: -1,
        };

        //
        handler.addEventListener("pointerdown", (ev) => {
            status.pointerId = ev.pointerId; this.#updateSize();
            const starting = [this.propGet("--resize-x") || 0, this.propGet("--resize-y") || 0];
            grabForDrag(this.#holder, ev, {
                propertyName: "resize",
                shifting: this.limitResize(starting, starting, this.#holder, this.#parent),
            });

            // @ts-ignore
            ev.target?.setPointerCapture?.(ev.pointerId);
        });

        //
        this.#holder.addEventListener(
            "m-dragstart",
            (ev) => {
                const dt = ev.detail;
                if (dt.holding.propertyName == "resize") {
                    //this.#resizeMute = true;
                }
            },
            {capture: true, passive: false}
        );

        //
        this.#holder.addEventListener(
            "m-dragging",
            (ev) => {
                const dt = ev.detail;
                if (
                    this.#holder &&
                    dt.pointer.id == status.pointerId &&
                    dt.holding.element.deref() == this.#holder &&
                    dt.holding.propertyName == "resize"
                ) {
                    this.limitResize(
                        dt.holding.modified,
                        dt.holding.shifting,
                        this.#holder,
                        this.#parent
                    );
                }
            },
            {capture: true, passive: false}
        );

        //
        this.#holder.addEventListener(
            "m-dragend",
            (ev) => {
                const dt = ev.detail;
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
        //this.#dragStatus = status;

        //
        handler.addEventListener("pointerdown", (ev) => {
            status.pointerId = ev.pointerId;

            //
            const shiftEv = (evp) => {
                if (evp.pointerId == ev.pointerId) {
                    unListenShift(evp);
                }

                {   //
                    this.#updateSize();
                    //const box = this.#holder.getBoundingClientRect();
                    const starting = [(this.#holder.offsetLeft || 0) * zoomOf(), (this.#holder.offsetTop || 0) * zoomOf()];//[this.propGet("--drag-x") || 0, this.propGet("--drag-y") || 0];

                    //
                    grabForDrag(this.#holder, ev, {
                        propertyName: "drag",
                        shifting: this.limitDrag(starting, starting, this.#holder, this.#parent),
                    });
                }
            };

            //
            const unListenShift = (evp) => {
                if (evp.pointerId == ev.pointerId) {
                    document.documentElement.removeEventListener("pointermove"  , shiftEv);
                    document.documentElement.removeEventListener("pointerup"    , unListenShift);
                    document.documentElement.removeEventListener("pointercancel", unListenShift);
                }
            };

            //
            document.documentElement.addEventListener("pointermove"  , shiftEv);
            document.documentElement.addEventListener("pointerup"    , unListenShift);
            document.documentElement.addEventListener("pointercancel", unListenShift);

            // @ts-ignore
            //ev.target?.setPointerCapture?.(ev.pointerId);
        });

        //
        const cancelShift = (ev)=>{
            //
            if (ev.type == "pointercancel" || ev.type == "pointerup") {
                // @ts-ignore
                //ev.target?.releasePointerCapture?.(ev.pointerId);
                status.pointerId = -1;
            }
        }

        //
        document.documentElement.addEventListener("pointerup"    , cancelShift);
        document.documentElement.addEventListener("pointercancel", cancelShift);

        //
        this.#holder.addEventListener(
            "m-dragging",
            (ev) => {
                const dt = ev.detail;
                if (
                    this.#holder &&
                    dt.pointer.id == status.pointerId &&
                    dt.holding.element.deref() == this.#holder &&
                    dt.holding.propertyName == "drag"
                ) {
                    // 15.11.2024 - anyways CSS corrects, and dragstart compute real position
                    /*this.limitDrag(
                        dt.holding.modified,
                        dt.holding.shifting,
                        this.#holder,
                        this.#holder.offsetParent
                    );*/
                }
            },
            {capture: true, passive: false}
        );
    }

    //
    propGet(name) {
        const prop = this.#holder.style.getPropertyValue(name);
        const num = prop != null && prop != "" ? parseFloat(prop) || 0 : null;
        return num || null;
    }

    //
    propFloat(name, val) {
        const pVal = this.#holder.style.getPropertyValue(name);
        if (parseFloat(pVal) != val && pVal != val || pVal == null) {
            this.#holder.style.setProperty(name, val, "");
        }
    }


    //
    longHover(options, fx = (ev) => {
        ev.target.dispatchEvent(
            new CustomEvent("long-hover", {detail: ev, bubbles: true})
        );
    }) {
        const handler = options.handler || this.#holder;
        const action: any = {
            pointerId: -1,
            timer: null
        };

        //
        const initiate = (ev)=>{
            if (ev.target.matches(options.selector) && action.pointerId < 0) {
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
        handler.addEventListener("pointerover", initiate);
        handler.addEventListener("pointerdown", initiate);

        //
        const cancelEv = (ev)=>{
            if ((ev.target as HTMLElement)?.matches(options.selector) && action.pointerId == ev.pointerId) {
                if (action.timer) {
                    clearTimeout(action.timer);
                }
                action.timer = null;
                action.pointerId = -1;

                // @ts-ignore
                ev.target?.releasePointerCapture?.(ev.pointerId);
            }
        }

        //
        document.documentElement.addEventListener("pointerout"   , cancelEv);
        document.documentElement.addEventListener("pointerup"    , cancelEv);
        document.documentElement.addEventListener("pointercancel", cancelEv);
    }


    //
    longPress(
        options: any = {},
        fx: any = null
    ) {
        fx ||= (ev) => {
            this.#holder.dispatchEvent(new CustomEvent("long-press", {detail: ev, bubbles: true}));
            //requestAnimationFrame(()=>navigator?.vibrate?.([10]))
        }

        //
        const action: any = {
            pointerId: -1,
            timer: null,
            cancelPromise: null,
            imTimer: null,
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
        const forMove: any[] = [null, {capture: true}];
        const forCanc: any[] = [null, {capture: true}];

        //
        const registerCoord = [
            (ev) => {
                if (ev.pointerId == action.pointerId) {
                    action.lastCoord[0] = ev.clientX;
                    action.lastCoord[1] = ev.clientY;
                }
            },
            {capture: true, passive: true},
        ];

        //
        const triggerOrCancel = (ev) => {
            if (ev.pointerId == action.pointerId) {
                action.lastCoord[0] = ev.clientX;
                action.lastCoord[1] = ev.clientY;

                //
                ev?.preventDefault();
                ev?.stopPropagation();

                // JS math logic megalovania...
                if (action.ready) {
                    immediate(null, action, ev);
                } else {
                    action.cancelRv?.();
                }
            }
        };

        //
        const cancelWhenMove = (ev) => {
            if (ev.pointerId == action.pointerId) {
                action.lastCoord[0] = ev.clientX;
                action.lastCoord[1] = ev.clientY;

                //
                ev?.preventDefault();
                ev?.stopPropagation();

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
        document.documentElement.addEventListener(
            "pointerdown",
            (ev) => {
                if (
                    (this.#holder.contains(ev.target as HTMLElement) && (options.handler ? (ev.target as HTMLElement).matches(options.handler) : false) || (ev.target == this.#holder)) &&
                    action.pointerId < 0 &&
                    (options.anyPointer || ev.pointerType == "touch")
                ) {
                    ev.preventDefault();
                    ev.stopPropagation();

                    //
                    action.pageCoord = [
                        ev.clientX,
                        ev.clientY,
                    ];
                    action.lastCoord = [
                        ev.clientX,
                        ev.clientY,
                    ];
                    action.pointerId = ev.pointerId;

                    //
                    const cancelPromiseWithResolve = Promise.withResolvers();
                    action.cancelPromise = cancelPromiseWithResolve.promise;
                    action.cancelRv = () => {
                        document.documentElement.removeEventListener(
                            "pointerup",
                            // @ts-ignore
                            ...forCanc
                        );
                        document.documentElement.removeEventListener(
                            "pointercancel",
                            // @ts-ignore
                            ...forCanc
                        );
                        document.documentElement.removeEventListener(
                            "pointermove",
                            // @ts-ignore
                            ...forMove
                        );

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
                    document.documentElement.addEventListener(
                        "pointerup",
                        // @ts-ignore
                        ...forCanc
                    );
                    document.documentElement.addEventListener(
                        "pointercancel",
                        // @ts-ignore
                        ...forCanc
                    );
                    document.documentElement.addEventListener(
                        "pointermove",
                        // @ts-ignore
                        ...forMove
                    );
                }
            },
            {passive: false, capture: false}
        );

        //
        document.documentElement.addEventListener(
            "pointerup",
            // @ts-ignore
            ...registerCoord
        );
        document.documentElement.addEventListener(
            "pointercancel",
            // @ts-ignore
            ...registerCoord
        );
        document.documentElement.addEventListener(
            "pointermove",
            // @ts-ignore
            ...registerCoord
        );
    }
}

//
export { AxGesture };