var App = Ember.Application.create();

App.initializer({
	name: 'performance',
	initialize: function (container, application) {
		EmPerfSender.initialize({
			send: function (events, metrics) {
				console.log(arguments);
			}
		});
	}
});

App.Router.map(function () {
	this.route('test');
});

App.TestView = Ember.View.extend({
	templateName: 'test'
});
