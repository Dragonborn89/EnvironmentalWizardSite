# environmentalwizard.com

Portfolio site of Alexander Rybak. Plain HTML and CSS with no build step, served by GitHub Pages.

- `index.html`: the homepage
- `work/<slug>/`: one folder per project page
- `earlier-work/`, `resume/`: the archive and the resume
- `style.css`, `site.js`: shared by every page
- The `*.html` files at the root (other than `index.html` and `404.html`) forward the old GoDaddy-era addresses to their new pages.

## Adding a project
1. Copy `work/light-angle/` to `work/<new-slug>/` and replace the content.
2. Add a card for it in the `#work` grid in `index.html`.

Preview locally:

```
python -m http.server 8770 --directory .
```
