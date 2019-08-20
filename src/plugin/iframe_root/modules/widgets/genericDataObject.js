define(['kb_common/html'], function (html) {
    'use strict';

    function factory({ runtime }) {
        var parent,
            container,
            div = html.tag('div'),
            p = html.tag('p');

        function attach(node) {
            parent = node;
            container = parent.appendChild(document.createElement('div'));
        }

        function render(params) {
            return div([p('This object does not have a specific visualization')]);
        }

        function start(params) {
            container.innerHTML = render(params);
        }

        function detach() {
            if (container) {
                parent.removeChild(container);
            }
        }

        return {
            attach: attach,
            start: start,
            detach: detach
        };
    }

    return {
        make: function (config) {
            return factory(config);
        }
    };
});
