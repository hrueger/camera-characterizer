<script lang="ts">
    import "../app.css";
</script>

<main>
    <slot />
</main>

<footer class="w-100 bg-light text-center p-4">
    &copy; 2025 Hannes Rüger, based on work by Jan Fröhlich<br />
    <i>Built with ❤️, Svelte & Bootstrap - Open Source on <a target="_blank" href="https://github.com/hrueger/camera-characterizer">GitHub</a></i>
</footer>

<style>
    main {
        min-height: calc(100vh - 6rem);
    }
</style>
