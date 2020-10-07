var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                let j = 0;
                const remove = [];
                while (j < node.attributes.length) {
                    const attribute = node.attributes[j++];
                    if (!attributes[attribute.name]) {
                        remove.push(attribute.name);
                    }
                }
                for (let k = 0; k < remove.length; k++) {
                    node.removeAttribute(remove[k]);
                }
                return nodes.splice(i, 1)[0];
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    function query_selector_all(selector, parent = document.body) {
        return Array.from(parent.querySelectorAll(selector));
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.23.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src/routes/PersonalProjects.svelte generated by Svelte v3.23.2 */

    const file = "src/routes/PersonalProjects.svelte";

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-y9qpr2-style";
    	style.textContent = "main.svelte-y9qpr2{text-align:center;padding:1em;max-width:240px;margin:0 auto}#wrap.svelte-y9qpr2{width:max-content;margin:auto}h1.svelte-y9qpr2{text-transform:uppercase;font-size:4em;font-weight:100}a.svelte-y9qpr2{margin:1rem;font-size:1.75rem;display:inline-block}@media(min-width: 640px){main.svelte-y9qpr2{max-width:none}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGVyc29uYWxQcm9qZWN0cy5zdmVsdGUiLCJzb3VyY2VzIjpbIlBlcnNvbmFsUHJvamVjdHMuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQ+XG5cdGNvbnN0IFFVRVJZID0gYFxuXHRcdHF1ZXJ5IHtcblx0XHRcdHBvc3Qoc2x1ZzogXCJwZXJzb25hbC1wcm9qZWN0c1wiKSB7XG5cdFx0XHRcdHRpdGxlXG5cdFx0XHRcdHNsdWdcblx0XHRcdFx0aHRtbFxuXHRcdFx0fVxuXHRcdH1cblx0YDtcblx0Y29uc3QgUVVFUllSRVMgPSB7XCJwb3N0XCI6e1widGl0bGVcIjpcIlBlcnNvbmFsIFByb2plY3RzXCIsXCJzbHVnXCI6XCJwZXJzb25hbC1wcm9qZWN0c1wiLFwiaHRtbFwiOlwiPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoIGFsaWduPVxcXCJjZW50ZXJcXFwiPlByb2plY3Q8L3RoPlxcbjx0aCBhbGlnbj1cXFwiY2VudGVyXFxcIj5EZXBsb3kgU3RhdHVzPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Pjx0cj5cXG48dGQgYWxpZ249XFxcImNlbnRlclxcXCI+PGEgaHJlZj1cXFwiaHR0cHM6Ly9zdG9yZGFobC5kZXZcXFwiPnN0b3JkYWhsLmRldjwvYT48L3RkPlxcbjx0ZCBhbGlnbj1cXFwiY2VudGVyXFxcIj48YSBocmVmPVxcXCJodHRwczovL2FwcC5uZXRsaWZ5LmNvbS9zaXRlcy9zdG9yZGFobGRvdGRldi9kZXBsb3lzXFxcIj48aW1nIHNyYz1cXFwiaHR0cHM6Ly9hcGkubmV0bGlmeS5jb20vYXBpL3YxL2JhZGdlcy9kYmRhOGUzZS0wMDlhLTQyMzgtOWE2NC1jZGM5N2RkNzI5OGEvZGVwbG95LXN0YXR1c1xcXCIgYWx0PVxcXCJOZXRsaWZ5IFN0YXR1c1xcXCI+PC9hPjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkIGFsaWduPVxcXCJjZW50ZXJcXFwiPjxhIGhyZWY9XFxcImh0dHBzOi8vZ3Jvd3d3Lm5ldGxpZnkuYXBwXFxcIj5ncm93d3c8L2E+PC90ZD5cXG48dGQgYWxpZ249XFxcImNlbnRlclxcXCI+PGEgaHJlZj1cXFwiaHR0cHM6Ly9hcHAubmV0bGlmeS5jb20vc2l0ZXMvZ3Jvd3d3L2RlcGxveXNcXFwiPjxpbWcgc3JjPVxcXCJodHRwczovL2FwaS5uZXRsaWZ5LmNvbS9hcGkvdjEvYmFkZ2VzL2FiYTA3NDM4LWZhMzktNDIwMS1iMWI3LTgxNzk2MjU5MDE2My9kZXBsb3ktc3RhdHVzXFxcIiBhbHQ9XFxcIk5ldGxpZnkgU3RhdHVzXFxcIj48L2E+PC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQgYWxpZ249XFxcImNlbnRlclxcXCI+PGEgaHJlZj1cXFwiaHR0cHM6Ly9nYXJ0ZW4uc3RvcmRhaGwuZGV2XFxcIj5nYXJ0ZW48L2E+PC90ZD5cXG48dGQgYWxpZ249XFxcImNlbnRlclxcXCI+PGEgaHJlZj1cXFwiaHR0cHM6Ly9hcHAubmV0bGlmeS5jb20vc2l0ZXMvY29kZWdhcnRlbi9kZXBsb3lzXFxcIj48aW1nIHNyYz1cXFwiaHR0cHM6Ly9hcGkubmV0bGlmeS5jb20vYXBpL3YxL2JhZGdlcy9iNjQzYWFiZi1mMzQwLTQ2YmQtOTIxYy04ZTFlN2UzOTFkNmYvZGVwbG95LXN0YXR1c1xcXCIgYWx0PVxcXCJOZXRsaWZ5IFN0YXR1c1xcXCI+PC9hPjwvdGQ+XFxuPC90cj5cXG48L3Rib2R5PjwvdGFibGU+XFxuXCIsXCJfX3R5cGVuYW1lXCI6XCJQb3N0XCJ9fTtcblx0XG5cdGNvbnN0IFFVRVJZUEFSQU1PUFRTID0gYFxuXHRcdHF1ZXJ5IHtcblx0XHRcdHBvc3RzIHtcblx0XHRcdFx0c2x1Z1xuXHRcdFx0fVxuXHRcdH1cblx0YDtcblxuPC9zY3JpcHQ+XG5cbjxzdHlsZT5cblx0bWFpbiB7XG5cdFx0dGV4dC1hbGlnbjogY2VudGVyO1xuXHRcdHBhZGRpbmc6IDFlbTtcblx0XHRtYXgtd2lkdGg6IDI0MHB4O1xuXHRcdG1hcmdpbjogMCBhdXRvO1xuXHR9XG5cblx0I3dyYXB7XG5cdFx0d2lkdGg6bWF4LWNvbnRlbnQ7XG5cdFx0bWFyZ2luOmF1dG87XG5cdH1cblxuXHRoMSB7XG5cdFx0dGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcblx0XHRmb250LXNpemU6IDRlbTtcblx0XHRmb250LXdlaWdodDogMTAwO1xuXHR9XG5cblx0YSB7XG5cdFx0bWFyZ2luOjFyZW07XG5cdFx0Zm9udC1zaXplOjEuNzVyZW07XG5cdFx0ZGlzcGxheTppbmxpbmUtYmxvY2s7XG5cblx0fVxuXHRcblx0QG1lZGlhIChtaW4td2lkdGg6IDY0MHB4KSB7XG5cdFx0bWFpbiB7XG5cdFx0XHRtYXgtd2lkdGg6IG5vbmU7XG5cdFx0fVxuICAgIH1cblxuPC9zdHlsZT5cblxuPHN2ZWx0ZTpoZWFkPlxuXHQ8dGl0bGU+YmNzU3RhdHVzIC0ge1FVRVJZUkVTLnBvc3QudGl0bGV9PC90aXRsZT5cbjwvc3ZlbHRlOmhlYWQ+XG5cbjxtYWluPlxuICAgIDxoMT57UVVFUllSRVMucG9zdC50aXRsZX08L2gxPlxuXHRcdDxhIGhyZWY9XCIvXCI+8J+UmTwvYT5cblx0XHQ8ZGl2IGlkPVwid3JhcFwiPlxuICAgIFx0e0BodG1sIFFVRVJZUkVTLnBvc3QuaHRtbH1cblx0XHQ8L2Rpdj5cbjwvbWFpbj4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBdUJDLElBQUksY0FBQyxDQUFDLEFBQ0wsVUFBVSxDQUFFLE1BQU0sQ0FDbEIsT0FBTyxDQUFFLEdBQUcsQ0FDWixTQUFTLENBQUUsS0FBSyxDQUNoQixNQUFNLENBQUUsQ0FBQyxDQUFDLElBQUksQUFDZixDQUFDLEFBRUQsbUJBQUssQ0FBQyxBQUNMLE1BQU0sV0FBVyxDQUNqQixPQUFPLElBQUksQUFDWixDQUFDLEFBRUQsRUFBRSxjQUFDLENBQUMsQUFDSCxjQUFjLENBQUUsU0FBUyxDQUN6QixTQUFTLENBQUUsR0FBRyxDQUNkLFdBQVcsQ0FBRSxHQUFHLEFBQ2pCLENBQUMsQUFFRCxDQUFDLGNBQUMsQ0FBQyxBQUNGLE9BQU8sSUFBSSxDQUNYLFVBQVUsT0FBTyxDQUNqQixRQUFRLFlBQVksQUFFckIsQ0FBQyxBQUVELE1BQU0sQUFBQyxZQUFZLEtBQUssQ0FBQyxBQUFDLENBQUMsQUFDMUIsSUFBSSxjQUFDLENBQUMsQUFDTCxTQUFTLENBQUUsSUFBSSxBQUNoQixDQUFDLEFBQ0MsQ0FBQyJ9 */";
    	append_dev(document.head, style);
    }

    function create_fragment(ctx) {
    	let title_value;
    	let t0;
    	let main;
    	let h1;
    	let t1_value = /*QUERYRES*/ ctx[0].post.title + "";
    	let t1;
    	let t2;
    	let a;
    	let t3;
    	let t4;
    	let div;
    	let raw_value = /*QUERYRES*/ ctx[0].post.html + "";
    	document.title = title_value = "bcsStatus - " + /*QUERYRES*/ ctx[0].post.title;

    	const block = {
    		c: function create() {
    			t0 = space();
    			main = element("main");
    			h1 = element("h1");
    			t1 = text(t1_value);
    			t2 = space();
    			a = element("a");
    			t3 = text("🔙");
    			t4 = space();
    			div = element("div");
    			this.h();
    		},
    		l: function claim(nodes) {
    			const head_nodes = query_selector_all("[data-svelte=\"svelte-1iwogm3\"]", document.head);
    			head_nodes.forEach(detach_dev);
    			t0 = claim_space(nodes);
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			h1 = claim_element(main_nodes, "H1", { class: true });
    			var h1_nodes = children(h1);
    			t1 = claim_text(h1_nodes, t1_value);
    			h1_nodes.forEach(detach_dev);
    			t2 = claim_space(main_nodes);
    			a = claim_element(main_nodes, "A", { href: true, class: true });
    			var a_nodes = children(a);
    			t3 = claim_text(a_nodes, "🔙");
    			a_nodes.forEach(detach_dev);
    			t4 = claim_space(main_nodes);
    			div = claim_element(main_nodes, "DIV", { id: true, class: true });
    			var div_nodes = children(div);
    			div_nodes.forEach(detach_dev);
    			main_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h1, "class", "svelte-y9qpr2");
    			add_location(h1, file, 61, 4, 1841);
    			attr_dev(a, "href", "/");
    			attr_dev(a, "class", "svelte-y9qpr2");
    			add_location(a, file, 62, 2, 1874);
    			attr_dev(div, "id", "wrap");
    			attr_dev(div, "class", "svelte-y9qpr2");
    			add_location(div, file, 63, 2, 1895);
    			attr_dev(main, "class", "svelte-y9qpr2");
    			add_location(main, file, 60, 0, 1830);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, main, anchor);
    			append_dev(main, h1);
    			append_dev(h1, t1);
    			append_dev(main, t2);
    			append_dev(main, a);
    			append_dev(a, t3);
    			append_dev(main, t4);
    			append_dev(main, div);
    			div.innerHTML = raw_value;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*QUERYRES*/ 1 && title_value !== (title_value = "bcsStatus - " + /*QUERYRES*/ ctx[0].post.title)) {
    				document.title = title_value;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	const QUERY = `
		query {
			post(slug: "personal-projects") {
				title
				slug
				html
			}
		}
	`;

    	const QUERYRES = {
    		"post": {
    			"title": "Personal Projects",
    			"slug": "personal-projects",
    			"html": "<table>\n<thead>\n<tr>\n<th align=\"center\">Project</th>\n<th align=\"center\">Deploy Status</th>\n</tr>\n</thead>\n<tbody><tr>\n<td align=\"center\"><a href=\"https://stordahl.dev\">stordahl.dev</a></td>\n<td align=\"center\"><a href=\"https://app.netlify.com/sites/stordahldotdev/deploys\"><img src=\"https://api.netlify.com/api/v1/badges/dbda8e3e-009a-4238-9a64-cdc97dd7298a/deploy-status\" alt=\"Netlify Status\"></a></td>\n</tr>\n<tr>\n<td align=\"center\"><a href=\"https://growww.netlify.app\">growww</a></td>\n<td align=\"center\"><a href=\"https://app.netlify.com/sites/growww/deploys\"><img src=\"https://api.netlify.com/api/v1/badges/aba07438-fa39-4201-b1b7-817962590163/deploy-status\" alt=\"Netlify Status\"></a></td>\n</tr>\n<tr>\n<td align=\"center\"><a href=\"https://garten.stordahl.dev\">garten</a></td>\n<td align=\"center\"><a href=\"https://app.netlify.com/sites/codegarten/deploys\"><img src=\"https://api.netlify.com/api/v1/badges/b643aabf-f340-46bd-921c-8e1e7e391d6f/deploy-status\" alt=\"Netlify Status\"></a></td>\n</tr>\n</tbody></table>\n",
    			"__typename": "Post"
    		}
    	};

    	const QUERYPARAMOPTS = `
		query {
			posts {
				slug
			}
		}
	`;

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PersonalProjects> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("PersonalProjects", $$slots, []);
    	$$self.$capture_state = () => ({ QUERY, QUERYRES, QUERYPARAMOPTS });
    	return [QUERYRES];
    }

    class PersonalProjects extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		if (!document.getElementById("svelte-y9qpr2-style")) add_css();
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PersonalProjects",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    var main = new PersonalProjects({target: document.body, hydrate: true});

    return main;

}());
