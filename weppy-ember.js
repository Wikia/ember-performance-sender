var Utils = {
    loaded: true,
    enabled: true,

    config: {
        enableAjaxFilter: false,
        minDuration: 50
    },

    adapters: {},

    log: function (msg) {
        console.log('### LOG');
        console.log(msg);
    },

    warn: function (msg) {
        console.log('### WARN');
        console.log(msg);
    },

    error: function (msg) {
        console.log('### ERROR');
        console.log(msg);
    },

    send: function (events, metrics) {
        console.log('### SEND');
        console.log(events.toString(), metrics);
    },

    slice: function (a) {
        return Array.prototype.slice.call(a)
    },

    aliasMethodChain: function (a, b, c, d) {
        var e = a[b];
        if ('function' == typeof e) {
            var f = '__' + b + '_without_' + c + '__',
                g = '__' + b + '_with_' + c + '__';
            a[f] = e, a[g] = a[b] = d
        }
        return a
    },

    __super__: function () {
        throw new Error('Cannot call __super__ outside of a wrapped function');
    },
    __empty__: function () {
    }
};

Utils.wrap = function (b, c) {
    return function () {
        var d = Utils.__super__,
            e = this,
            f = Utils.slice(arguments);
        try {
            return Utils.__super__ = 'function' == typeof b ? function () {
                return this === Utils ? 0 === arguments.length ? b.apply(e, f) : b.apply(e, arguments) :
                    b.apply(this, arguments)
            } : Utils.__empty__, c.apply(this, arguments)
        } finally {
            Utils.__super__ = d
        }
    }
};

var WeppyEmber = function (Utils, Ember, $) {
    'use strict';
    var EmberAdapter = {
        VERSION: '0.0.1'
    };

    if (Utils.plugins && Utils.plugins.Ember) {
        Utils.plugins.Ember.VERSION === EmberAdapter.VERSION ?
            Utils.warn('Already loaded weppy-ember v' + EmberAdapter.VERSION) :
            Utils.error('Failed to load weppy-ember v' + EmberAdapter.VERSION + ': ' +
            'another version of weppy-ember (v' + Utils.plugins.Ember.VERSION + ') was already loaded');
    } else if (void 0 === Ember) {
        Utils.error('Failed to load weppy-ember: Ember could not be found');
    } else if (void 0 === $) {
        Utils.error('Failed to load weppy-ember: $ could not be found');
    } else {
        Utils.log('Initializing weppy-ember v' + EmberAdapter.VERSION);
        Utils.config.enableAjaxFilter = Utils.config.enableAjaxFilter || false;
        Utils.config.minDuration = Utils.config.minDuration || 50;

        var traceStack = [],
            getLastTraceItem = function () {
                return traceStack[traceStack.length - 1];
            },
            traceAjaxRequest = function (method, url) {
                this.method = method;
                this.url = url;
                this.pending = true;
                this.trace = getLastTraceItem();

                this.trace && this.trace.events.push(this);
                this.startTime = Date.now();
            };

        traceAjaxRequest.prototype.stop = function () {
            if (this.pending) {
                this.stopTime = Date.now();
                this.pending = false;
            } else {
                Utils.warn('[BUG] Attempted to stop an AJAX request twice.')
            }
        };

        traceAjaxRequest.prototype.serialize = function (time) {
            if (this.pending === false) {
                time = time || 0;
                return ['a', this.method, this.url, this.startTime - time, this.stopTime - this.startTime];
            }
        };

        var traceViewRender = function (viewName) {
            this.viewName = viewName;
            this.pending = true;
            this.trace = getLastTraceItem();

            this.trace && this.trace.events.push(this);
            this.startTime = Date.now();
        };

        traceViewRender.prototype.stop = traceAjaxRequest.prototype.stop;

        traceViewRender.prototype.serialize = function (time) {
            if (this.pending === false) {
                time = time || 0;
                return ['r', this.viewName, this.startTime - time, this.stopTime - this.startTime];
            }
        };

        var trace = function (klass, method, pattern) {
            this.klass = klass;
            this.method = method;
            this.pattern = pattern;
            this.events = [];
            this.finalized = false;

            traceStack.push(this);
            this.startTime = Date.now();
        };

        trace.prototype.pause = function () {
            for (var a = 1; a <= traceStack.length; a++) {
                traceStack[traceStack.length - a] === this &&
                traceStack.splice(traceStack.length - a, 1)
            }
        };

        trace.prototype.resume = function () {
            this.pause();
            traceStack.push(this);
        };

        trace.prototype.finalize = function () {
            if (this.finalized === !0) {
                Utils.warn('[BUG] Attempted to finalize a trace twice.');
                return;
            }

            this.pause();

            for (var b = 0; b < this.events.length; b++) {
                if (this.events[b].pending) return;
            }

            this.stopTime = Date.now();
            this.finalized = !0;
            this.duration = this.stopTime - this.startTime;

            if (this.duration < (Utils.config.minDuration || 1)) {
                Utils.log('Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' +
                this.duration + 'ms. (minDuration is ' + Utils.config.minDuration + 'ms)');
                return;
            }

            if (Utils.config.enableAjaxFilter === true) {
                var ajaxRequestToTrace = false;

                for (b = 0; b < this.events.length; b++)
                    if (this.events[b] instanceof traceAjaxRequest) {
                        ajaxRequestToTrace = true;
                        break
                    }

                if (!ajaxRequestToTrace) {
                    Utils.log('Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' +
                    this.duration + 'ms. (enableAjaxFilter is true)');
                    return;
                }
            }

            Utils.log('Sending: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' + this.duration +
            'ms.');

            this.url = window.location.hash || window.location.pathname;

            var metrics = {
                bs: this.startTime,
                bd: this.duration,
                bu: this.url
            };

            this.klass && this.klass.length && (metrics.bc = this.klass);
            this.method && this.method.length && (metrics.bm = this.method);
            this.pattern && this.pattern.length && (metrics.bp = this.pattern);

            var events = [];
            for (b = 0; b < this.events.length; b++) {
                events.push(this.events[b].serialize(this.startTime));
            }

            Utils.send(events, metrics)
        };

        var getRoutePattern = function (EmberRoute) {
                try {
                    var routeName = EmberRoute.get('routeName'),
                        segments = EmberRoute.get('router.router.recognizer.names')[routeName].segments,
                        listOfSegments = [];

                    for (var e = 0; e < segments.length; e++) {
                        var segment = null;
                        try {
                            segment = segments[e].generate();
                        } catch (g) {
                            segment = ':' + segments[e].name;
                        }
                        segment && listOfSegments.push(segment);
                    }
                    return '/' + listOfSegments.join('/');
                } catch (g) {
                    return '/';
                }
            },
            traceRouteEvent = function () {
                var pattern = getRoutePattern(this),
                    lastTrace = getLastTraceItem();

                if (lastTrace) {
                    lastTrace.klass = this.constructor.toString();
                    lastTrace.method = void 0;
                    return lastTrace.pattern = pattern;
                } else {
                    new trace(this.constructor.toString(), void 0, pattern);
                    return this._super.apply(this, Utils.slice(arguments));
                }
            };

        Ember.Route.reopen({
            beforeModel: traceRouteEvent,
            afterModel: traceRouteEvent,
            enter: traceRouteEvent
            // TODO this currently causes 'TypeError: Cannot set property '_qpDelegate' of undefined'
            //setup: traceRouteEvent
        });

        Ember.CoreView.reopen({
            /**
             * Triggers a named event for the object. Any additional arguments
             * will be passed as parameters to the functions that are subscribed to the
             * event.
             *
             * @method trigger
             * @param {String} eventName The name of the event
             * @param {Object...} args Optional arguments to pass on
             */
            trigger: function (eventName) {
                var className = this.constructor.toString(),
                    isNotEmberClass = (
                    'Ember' !== className.substr(0, 5) &&
                        //(subclass of Ember...)
                    'Ember' !== className.substr(13, 5)),

                // TODO this was logging only route transitions for me. why?
                //isEvent = this.constructor.prototype.hasOwnProperty(eventName),
                    isEvent = true,

                    magicCondition = !getLastTraceItem() &&
                        isNotEmberClass &&
                        isEvent;

                if (magicCondition) {
                    new trace(this.constructor.toString(), eventName);
                }
                return this._super.apply(this, Utils.slice(arguments));
            }
        });

        var wrap = function (method) {
                var traceItem = getLastTraceItem();

                if (traceItem) {
                    'undefined' == typeof traceItem.pattern && (traceItem.klass = this.constructor.toString());
                    traceItem.method = method;
                } else {
                    new trace(this.constructor.toString(), method);
                }
            },
            wrapEvent = function (eventName, callback) {
                if ('function' == typeof callback) {
                    return Utils.wrap(callback, function () {
                        wrap.call(this, eventName);
                        Utils.__super__()
                    });
                } else {
                    return callback;
                }
            };

        if ('undefined' == typeof Ember.ActionHandler) {
            Ember.Route.reopen({
                init: function () {
                    var a = this._super();
                    for (var eventName in this.events) {
                        this.events.hasOwnProperty(eventName) &&
                        (this.events[eventName] = wrapEvent(eventName, this.events[eventName]));
                    }
                    return a;
                }
            });

            Ember.ControllerMixin.reopen({
                send: function (b) {
                    return this[b] && wrap.call(this, b), this._super.apply(this, Utils.slice(arguments))
                }
            });
        } else {
            Ember.ActionHandler.reopen({
                willMergeMixin: function (props) {
                    var eventName,
                        parent = this._super(props);

                    if (props._actions) {
                        for (eventName in props._actions) {
                            props._actions.hasOwnProperty(eventName) &&
                            (props._actions[eventName] = wrapEvent(eventName, props._actions[eventName]));
                        }
                    } else if (props.events) {
                        for (eventName in props.events) {
                            props.events.hasOwnProperty(eventName) &&
                            (props.events[eventName] = wrapEvent(eventName, props.events[eventName]));
                        }
                    }
                    return parent;
                }
            });
        }

        var n = new RegExp('<(?:\\(subclass of )?(.*?)\\)?:.*>');
        Ember.subscribe('render.view', {
            before: function (a, b, c) {
                if (getLastTraceItem()) {
                    var parentClass = c.object.match(n)[1];
                    if ('Ember' !== parentClass.substr(0, 5) && 'LinkView' !== parentClass) {
                        return new traceViewRender(parentClass);
                    }
                }
            },
            after: function (a, b, c, d) {
                d && d.stop();
            }
        });

        Ember.run.backburner.options.onEnd = Utils.wrap(Ember.run.backburner.options.onEnd, function (b, c) {
            if (!c && traceStack.length) {
                for (var d = 0; d < traceStack.length; d++) {
                    traceStack[d].finalize();
                }
            }
            return Utils.__super__();
        });

        Utils.aliasMethodChain($, 'ajax', 'instrumentation', Utils.wrap($.ajax, function () {
            if (getLastTraceItem()) {
                var b = arguments[1] || arguments[0],
                    c = b.type || 'GET',
                    d = b.url || arguments[0];
                'string' == typeof b && (b = {});
                var e = new traceAjaxRequest(c, d);
                return b.success = Utils.wrap(b.success, function () {
                    return e.trace.resume(), e.stop(), Utils.__super__()
                }), b.error = Utils.wrap(b.error, function () {
                    return e.trace.resume(), e.stop(), Utils.__super__()
                }), b.url = d, Utils.__super__(b)
            }
            return Utils.__super__()
        }));

        Utils.adapters.Ember = EmberAdapter;
        Utils.log('Sucessfully loaded weppy-ember v' + EmberAdapter.VERSION);
    }
}(Utils, Ember, $);
