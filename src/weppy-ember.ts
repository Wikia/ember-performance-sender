module WeppyEmber {
	export interface MetricsReport {
		startTime: number;
		duration: number;
		url: string;
		klass?: string;
		method?: string;
		pattern?: string;
	}

	export interface WeppyEmberConfig {
		enableAjaxFilter: boolean;
		enableLogging: boolean;
		error?: (message: string) => void;
		log?: (message: string) => void;
		minDuration: number;
		send: (events: any[], metrics: MetricsReport) => void;
		warn?: (message: string ) => void;
	}

	export var VERSION: string = '0.1.0';
	export var loaded: boolean = false;
	export var enabled: boolean = false;
	export var config: WeppyEmberConfig = {
		enableAjaxFilter: false,
		enableLogging: true,
		minDuration: 50,
		log: (message) => { console.log(message); },
		send: (events, metrics) => { console.log('Sending (Dry Run)\n============================\n', metrics); },
		warn: (message) => { console.log('warn: ' + message); },
		error: (message) => { console.log('error: ' + message); }
	};

	var traceStack = [];

	function getLastTraceItem () {
		return traceStack[traceStack.length - 1];
	}

	function getConfigMethod(method, ...args) {
		if (config.enableLogging && typeof config[method] === 'function') {
			return config[method].apply(this, args);
		}
		console.warn('Method ' + method + 'not found');
	}

	function decorate(orig, decorator) {
		return function () {
			var ret;
			try {
				ret = decorator.apply(this, arguments);
			} catch (e) {
				throw e;
			}
			return (typeof orig === 'function' ? orig : () => {}).apply(this, arguments);
		}
	}

	function aliasMethodChain ($, method, label, wrapper) {
		var e = $[method];
		if ('function' == typeof e) {
			var f = '__' + method + '_without_' + label + '__',
				g = '__' + method + '_with_' + label + '__';

			$[f] = e;
			$[g] = $[method] = wrapper;
		}
		return $;
	}

	class BaseTrace {
		pending: boolean;
		startTime: number;
		stopTime: number;
		trace: any;

		stop () {
			if (this.pending) {
				this.stopTime = Date.now();
				this.pending = false;
			} else {
				getConfigMethod('warn', '[BUG] ' + this.constructor['name'] + ': Attempted to stop a view render twice.')
			}
		}

		serialize (time: number = 0, ...additionalParams: string[]): any[] {
			if (this.pending === false) {
				var serialized = [this.constructor['name'],  this.startTime - time, this.stopTime - this.startTime];
				if (additionalParams.length) {
					serialized = serialized.concat(additionalParams);
				}
				return serialized;
			}
		}
	}

	class AjaxTrace extends BaseTrace {
		method: string;
		url: string;

		constructor (method, url) {
			this.method = method;
			this.url = url;
			this.pending = true;
			this.trace = getLastTraceItem();
			this.trace && this.trace.events.push(this);
			this.startTime = Date.now();

			super();
		}

		serialize (time: number): any[] {
			return super.serialize(time, this.method, this.url);
		}
	}

	class ViewRenderTrace extends BaseTrace {
		viewName: string;

		constructor (viewName) {
			this.viewName = viewName;
			this.pending = true;
			this.trace = getLastTraceItem();
			this.trace && this.trace.events.push(this);
			this.startTime = Date.now();

			super();
		}

		serialize (time: number): any[] {
			return super.serialize(time, this.viewName);
		}
	}

	class Trace extends BaseTrace {
		duration: number;
		events: Trace[];
		finalized: boolean;
		klass: string;
		method: string;
		pattern: string;
		pending: boolean;
		startTime: number;
		stopTime: number;
		url: string;

		constructor (klass, method, pattern?) {
			this.klass = klass;
			this.method = method;
			this.pattern = pattern;
			this.events = [];
			this.finalized = false;
			traceStack.push(this);
			this.startTime = Date.now();
			super();
		}

		serialize (time: number): any[] {
			return super.serialize(time, this.klass, this.method, this.url);
		}

		pause () {
			for (var i = 1; i <= traceStack.length; i++) {
				traceStack[traceStack.length - i] === this &&
				traceStack.splice(traceStack.length - i, 1);
			}
		}

		resume () {
			this.pause();
			traceStack.push(this);
		}

		finalize () {
			if (this.finalized === !0) {
				getConfigMethod('warn', '[BUG] Attempted to finalize a trace twice.');
				return;
			}

			this.pause();

			for (var i = 0; i < this.events.length; i++) {
				if (this.events[i].pending) return;
			}

			this.stopTime = Date.now();
			this.finalized = !0;
			this.duration = this.stopTime - this.startTime;

			if (this.duration < (config.minDuration || 1)) {
				getConfigMethod('log', 'Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' +
				this.duration + 'ms. (minDuration is ' + config.minDuration + 'ms)');
				return;
			}

			if (config.enableAjaxFilter === true) {
				var ajaxRequestToTrace = false;

				for (i = 0; i < this.events.length; i++)
					if (this.events[i] instanceof AjaxTrace) {
						ajaxRequestToTrace = true;
						break
					}

				if (!ajaxRequestToTrace) {
					getConfigMethod('log', 'Dropped: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' +
					this.duration + 'ms. (enableAjaxFilter is true)');
					return;
				}
			}

			getConfigMethod('log', 'Sending: ' + this.klass + '.' + this.method + ' (' + this.pattern + '), took ' + this.duration +
			'ms.');

			this.url = window.location.hash || window.location.pathname;

			var metrics: MetricsReport = {
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

			config.send(events, metrics)
		}
	}

	export function initialize (userConfig: WeppyEmberConfig, Ember = window['Ember'], $ = window['jQuery']) {
		'use strict';

		if (Ember === undefined) {
			throw ReferenceError('WeppyEmber cannot find Ember! Check that you have loaded Ember correctly before WeppyEmber!')
		} else if ($ === undefined) {
			throw ReferenceError('WeppyEmber cannot find jQuery! Make sure you have loaded jQuery before Ember and WeppyEmber!');
		} else {
			getConfigMethod('log','Initializing weppy-ember v' + VERSION);
			config = $.extend(config, userConfig);

			var getRoutePattern = function (EmberRoute) {
					try {
						var routeName = EmberRoute.get('routeName'),
							segments = EmberRoute.get('router.router.recognizer.names')[routeName].segments,
							listOfSegments = [];

						for (var i = 0; i < segments.length; i++) {
							var segment = null;
							try {
								segment = segments[i].generate();
							} catch (err) {
								segment = ':' + segments[i].name;
							}
							segment && listOfSegments.push(segment);
						}
						return '/' + listOfSegments.join('/');
					} catch (err) {
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
						new Trace(this.constructor.toString(), void 0, pattern);
						return this._super.apply(this, arguments);
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

						// TODO this caused logging only for route transitions for me. why?
						//isEvent = this.constructor.prototype.hasOwnProperty(eventName),
						isEvent = true,

						shouldTrace = !getLastTraceItem() &&
							isNotEmberClass &&
							isEvent;

					if (shouldTrace) {
						new Trace(this.constructor.toString(), eventName);
					}

					return this._super.apply(this, arguments);
				}
			});

			var wrap = function (method) {
					var traceItem = getLastTraceItem();

					if (traceItem) {
						'undefined' == typeof traceItem.pattern && (traceItem.klass = this.constructor.toString());
						traceItem.method = method;
					} else {
						new Trace(this.constructor.toString(), method);
					}
				},
				wrapEvent = function (eventName, callback) {
					if ('function' == typeof callback) {
						return decorate(callback, function () {
							wrap.call(this, eventName);
						});
					} else {
						return callback;
					}
				};

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

			var subclassPattern = new RegExp('<(?:\\(subclass of )?(.*?)\\)?:.*>');
			Ember.subscribe('render.view', {
				before: function (eventName, time, container) {
					if (getLastTraceItem()) {
						var parentClass = container.object.match(subclassPattern)[1];
						if ('Ember' !== parentClass.substr(0, 5) && 'LinkView' !== parentClass) {
							return new ViewRenderTrace(parentClass);
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

			aliasMethodChain($, 'ajax', 'instrumentation', decorate($.ajax, function () {
				if (getLastTraceItem()) {
					var request = arguments[1] || arguments[0],
						type = request.type || 'GET',
						url = request.url || arguments[0];

					'string' == typeof request && (request = {});
					var tracer = new AjaxTrace(type, url);

					request.success = decorate(request.success, function () {
						tracer.trace.resume();
						tracer.stop();
					});

					request.error = decorate(request.error, function () {
						tracer.trace.resume();
						tracer.stop();
					});

					request.url = url;
				}
			}));
		}
	};
}
