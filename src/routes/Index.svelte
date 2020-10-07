<svelte:head>
	<title>bcsStatus - Netlify Build Status</title>
</svelte:head>

<script>
	const QUERY = `
		query {
			posts {
				title
				slug
			}
		}
	`;
	const QUERYRES = {};

</script>


<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	h1 {
		text-transform: uppercase;
		font-size: 4em;
		font-weight: 100;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
    }
    
	ul {
		margin: 0 0 1em 0;
		line-height: 1.5;
		list-style-type:none;
    }

</style>

<main>
    <h1>Collections</h1>
		<ul>
			{#each QUERYRES.posts as post}
				<li><a href='/{post.slug}'>{post.title}</a></li>
			{/each}
		</ul>
</main>