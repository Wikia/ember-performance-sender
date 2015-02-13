var Utils = {
    loaded: true,
    enabled: true,
    config: {
        enableAjaxFilter: false,
        minDuration: 50
    },
    adapters: {},
    log: function (msg) {
        //console.log('### LOG');
        //console.log(msg);
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
    aliasMethodChain: function ($, method, label, wrapper) {
        var e = $[method];
        if ('function' == typeof e) {
            var f = '__' + method + '_without_' + label + '__', g = '__' + method + '_with_' + label + '__';
            $[f] = e;
            $[g] = $[method] = wrapper;
        }
        return $;
    }
};
function decorate(orig, decorator) {
    return function () {
        var ret;
        try {
            ret = decorator.apply(this, arguments);
        }
        catch (e) {
            throw 'decorator error';
        }
        return (typeof orig === 'function' ? orig : function () {
        }).apply(this, arguments);
    };
}
var WeppyEmber = function (Utils, Ember, $) {
    'use strict';
    var EmberAdapter = {
        VERSION: '0.0.10'
    };
    if (Utils.plugins && Utils.plugins.Ember) {
        Utils.plugins.Ember.VERSION === EmberAdapter.VERSION ? Utils.warn('Already loaded weppy-ember v' + EmberAdapter.VERSION) : Utils.error('Failed to load weppy-ember v' + EmberAdapter.VERSION + ': ' + 'another version of weppy-ember (v' + Utils.plugins.Ember.VERSION + ') was already loaded');
    }
    else if (void 0 === Ember) {
        Utils.error('Failed to load weppy-ember: Ember could not be found');
    }
    else if (void 0 === $) {
        Utils.error('Failed to load weppy-ember: $ could not be found');
    }
    else {
        Utils.log('Initializing weppy-ember v' + EmberAdapter.VERSION);
        Utils.config.enableAjaxFilter = Utils.config.enableAjaxFilter || false;
        Utils.config.minDuration = Utils.config.minDuration || 50;
        var traceStack = [], getLastTraceItem = function () {
            return traceStack[traceStack.length - 1];
        }, traceAjaxRequest = function (method, url) {
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
            }
            else {
                Utils.warn('[BUG] Attempted to stop an AJAX request twice.');
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
        traceViewRender.prototype.stop = function () {
            if (this.pending) {
                this.stopTime = Date.now();
                this.pending = false;
            }
            else {
                Utils.warn('[BUG] Attempted to stop a view render twice.');
            }
        };
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
            for (var i = 1; i <= traceStack.length; i++) {
                traceStack[traceStack.length - i] === this && traceStack.splice(traceStack.length - i, 1);
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
            for (var i = 0; i < this.events.length; i++) {
                if (this.events[i].pending)
                    return;
            }
            this.stopTime = Date.now();
            this.finalized = !0;
            this.duration = this.stopTime - this.startTime;
            if (this.duration < (Utils.config.minDuration || 1)) {
                Utils.log('Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' + this.duration + 'ms. (minDuration is ' + Utils.config.minDuration + 'ms)');
                return;
            }
            if (Utils.config.enableAjaxFilter === true) {
                var ajaxRequestToTrace = false;
                for (i = 0; i < this.events.length; i++)
                    if (this.events[i] instanceof traceAjaxRequest) {
                        ajaxRequestToTrace = true;
                        break;
                    }
                if (!ajaxRequestToTrace) {
                    Utils.log('Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' + this.duration + 'ms. (enableAjaxFilter is true)');
                    return;
                }
            }
            Utils.log('Sending: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' + this.duration + 'ms.');
            this.url = window.location.hash || window.location.pathname;
            var metrics = {
                startTime: this.startTime,
                duration: this.duration,
                url: this.url
            };
            this.klass && this.klass.length && (metrics.klass = this.klass);
            this.method && this.method.length && (metrics.method = this.method);
            this.pattern && this.pattern.length && (metrics.pattern = this.pattern);
            var events = [];
            for (i = 0; i < this.events.length; i++) {
                events.push(this.events[i].serialize(this.startTime));
            }
            Utils.send(events, metrics);
        };
        var getRoutePattern = function (EmberRoute) {
            try {
                var routeName = EmberRoute.get('routeName'), segments = EmberRoute.get('router.router.recognizer.names')[routeName].segments, listOfSegments = [];
                for (var i = 0; i < segments.length; i++) {
                    var segment = null;
                    try {
                        segment = segments[i].generate();
                    }
                    catch (err) {
                        segment = ':' + segments[i].name;
                    }
                    segment && listOfSegments.push(segment);
                }
                return '/' + listOfSegments.join('/');
            }
            catch (err) {
                return '/';
            }
        }, traceRouteEvent = function () {
            var pattern = getRoutePattern(this), lastTrace = getLastTraceItem();
            if (lastTrace) {
                lastTrace.klass = this.constructor.toString();
                lastTrace.method = void 0;
                return lastTrace.pattern = pattern;
            }
            else {
                new trace(this.constructor.toString(), void 0, pattern);
                return this._super.apply(this, arguments);
            }
        };
        Ember.Route.reopen({
            beforeModel: traceRouteEvent,
            afterModel: traceRouteEvent,
            enter: traceRouteEvent
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
                var className = this.constructor.toString(), isNotEmberClass = ('Ember' !== className.substr(0, 5) && 'Ember' !== className.substr(13, 5)), 
                // TODO this caused logging only for route transitions for me. why?
                //isEvent = this.constructor.prototype.hasOwnProperty(eventName),
                isEvent = true, shouldTrace = !getLastTraceItem() && isNotEmberClass && isEvent;
                if (shouldTrace) {
                    new trace(this.constructor.toString(), eventName);
                }
                return this._super.apply(this, arguments);
            }
        });
        var wrap = function (method) {
            var traceItem = getLastTraceItem();
            if (traceItem) {
                'undefined' == typeof traceItem.pattern && (traceItem.klass = this.constructor.toString());
                traceItem.method = method;
            }
            else {
                new trace(this.constructor.toString(), method);
            }
        }, wrapEvent = function (eventName, callback) {
            if ('function' == typeof callback) {
                return decorate(callback, function () {
                    wrap.call(this, eventName);
                });
            }
            else {
                return callback;
            }
        };
        Ember.ActionHandler.reopen({
            willMergeMixin: function (props) {
                var eventName, parent = this._super(props);
                if (props._actions) {
                    for (eventName in props._actions) {
                        props._actions.hasOwnProperty(eventName) && (props._actions[eventName] = wrapEvent(eventName, props._actions[eventName]));
                    }
                }
                else if (props.events) {
                    for (eventName in props.events) {
                        props.events.hasOwnProperty(eventName) && (props.events[eventName] = wrapEvent(eventName, props.events[eventName]));
                    }
                }
                return parent;
            }
        });
        var subclassPattern = new RegExp('<(?:\\(subclass of )?(.*?)\\)?:.*>');
        Ember.subscribe('render.view', {
            before: function (eventName, time, container) {
                if (getLastTraceItem()) {
                    var parentClass = container.object.match(subclassPattern)[1];
                    if ('Ember' !== parentClass.substr(0, 5) && 'LinkView' !== parentClass) {
                        return new traceViewRender(parentClass);
                    }
                }
            },
            after: function (eventName, time, container, tracer) {
                tracer && tracer.stop();
            }
        });
        Ember.run.backburner.options.onEnd = decorate(Ember.run.backburner.options.onEnd, function (current, next) {
            if (!next && traceStack.length) {
                for (var d = 0; d < traceStack.length; d++) {
                    traceStack[d].finalize();
                }
            }
        });
        Utils.aliasMethodChain($, 'ajax', 'instrumentation', decorate($.ajax, function () {
            if (getLastTraceItem()) {
                var request = arguments[1] || arguments[0], type = request.type || 'GET', url = request.url || arguments[0];
                'string' == typeof request && (request = {});
                var tracer = new traceAjaxRequest(type, url);
                request.success = decorate(request.success, function () {
                    debugger;
                    tracer.trace.resume();
                    tracer.stop();
                });
                request.error = decorate(request.error, function () {
                    debugger;
                    tracer.trace.resume();
                    tracer.stop();
                });
                request.url = url;
            }
        }));
        Utils.adapters.Ember = EmberAdapter;
        Utils.log('Sucessfully loaded weppy-ember v' + EmberAdapter.VERSION);
    }
}(Utils, Ember, $);
