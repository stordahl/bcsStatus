<script>
	const QUERY = `
		query {
			post(slug: "${QUERYPARAMS['slug']}") {
				title
				slug
				html
			}
		}
	`;
	const QUERYRES = {};
	
	const QUERYPARAMOPTS = `
		query {
			posts {
				slug
			}
		}
	`;

</script>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	#wrap{
		width:max-content;
		margin:auto;
	}

	h1 {
		text-transform: uppercase;
		font-size: 4em;
		font-weight: 100;
	}

	a {
		margin:1rem;
		font-size:1.75rem;
		display:inline-block;

	}
	
	@media (min-width: 640px) {
		main {
			max-width: none;
		}
    }

</style>

<svelte:head>
	<title>bcsStatus - {QUERYRES.post.title}</title>
</svelte:head>

<main>
    <h1>{QUERYRES.post.title}</h1>
		<a href="/">🔙</a>
		<div id="wrap">
    	{@html QUERYRES.post.html}
		</div>
</main>