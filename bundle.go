// bundle.go — produces dist/dunno.html: a single-file, zero-dependency dunno editor.
//
//   go run bundle.go
//   go run bundle.go --out dunno.html

package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

func readBase64(path, mime string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		panic(fmt.Sprintf("read %s: %v", path, err))
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
}

func readText(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		panic(fmt.Sprintf("read %s: %v", path, err))
	}
	return string(b)
}

func readManifestVersion(rootDir string) string {
	b, err := os.ReadFile(filepath.Join(rootDir, "manifest.json"))
	if err != nil {
		return "dev"
	}
	var m struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(b, &m); err != nil || m.Version == "" {
		return "dev"
	}
	return m.Version
}

// ── JS module bundler ─────────────────────────────────────────────────────────

var (
	// Matches both single-line and multi-line imports; captures the module specifier.
	reImportBlock = regexp.MustCompile(`(?s)import\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"];?`)
	reExportDecl  = regexp.MustCompile(`^(export\s+)((?:async\s+)?(?:function|const|let|var|class)\b)`)
	reExportBrace = regexp.MustCompile(`^export\s*\{[^}]*\}`)
	reExportDef   = regexp.MustCompile(`^export\s+default\b`)
)

type bundler struct {
	seen   map[string]bool
	chunks []string
}

func (b *bundler) walk(absPath string) {
	if b.seen[absPath] {
		return
	}
	b.seen[absPath] = true

	src := readText(absPath)
	dir := filepath.Dir(absPath)

	// Walk imports first (topological order).
	for _, m := range reImportBlock.FindAllStringSubmatch(src, -1) {
		spec := m[1]
		if strings.HasPrefix(spec, ".") {
			resolved := filepath.Clean(filepath.Join(dir, spec))
			b.walk(resolved)
		}
	}

	// Strip all import blocks, then process line-by-line for export stripping.
	stripped := reImportBlock.ReplaceAllString(src, "")

	var out []string
	for _, raw := range strings.Split(stripped, "\n") {
		line := strings.TrimSpace(raw)

		if reExportBrace.MatchString(line) {
			continue
		}
		if reExportDef.MatchString(line) {
			continue
		}
		if reExportDecl.MatchString(line) {
			if idx := strings.Index(raw, "export "); idx >= 0 {
				raw = raw[:idx] + raw[idx+7:]
			}
		}
		out = append(out, raw)
	}

	b.chunks = append(b.chunks,
		fmt.Sprintf("// ── %s ──", filepath.Base(absPath)),
		strings.Join(out, "\n"),
	)
}

func buildIifeBundle(rootDir string) string {
	b := &bundler{seen: make(map[string]bool)}
	b.walk(filepath.Join(rootDir, "js/main.js"))

	var sb strings.Builder
	sb.WriteString("<script>\n(function() {\n'use strict';\n\n")
	for _, chunk := range b.chunks {
		sb.WriteString(chunk)
		sb.WriteString("\n\n")
	}
	sb.WriteString("})();\n</script>")

	iife := sb.String()
	iife = strings.ReplaceAll(iife, "</script>", `<\/script>`)
	iife = iife[:len(iife)-len(`<\/script>`)] + "</script>"
	return iife
}

// ── HTML processing ───────────────────────────────────────────────────────────

// embedManifest inlines manifest.json — icon included — as a base64 data:
// URI directly on the <link rel="manifest"> tag. This makes the woven
// dist/dunno.html installable as a desktop/PWA app (Chrome 112+, Edge) with
// no sibling manifest.json and no service worker needed for the
// install-from-menu path. start_url is forced to "/": most installability
// checks treat a manifest with no start_url as invalid even though the
// spec's documented fallback is the document URL, so this assumes the file
// is served from a domain root rather than opened loose via file://.
func embedManifest(html, rootDir string) string {
	manifestPath := filepath.Join(rootDir, "manifest.json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		// No manifest.json in this project — leave the link tag as-is (it'll
		// just 404 if ever served, same as today).
		return html
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		panic(fmt.Sprintf("parse manifest.json: %v", err))
	}

	iconPath := filepath.Join(rootDir, "icon.png")
	if _, err := os.Stat(iconPath); err == nil {
		img, ierr := os.Open(iconPath)
		w, h := 0, 0
		if ierr == nil {
			defer img.Close()
			if cfg, cerr := png.DecodeConfig(img); cerr == nil {
				w, h = cfg.Width, cfg.Height
			}
		}
		sizes := "any"
		if w > 0 && h > 0 {
			sizes = fmt.Sprintf("%dx%d", w, h)
		}
		m["icons"] = []map[string]string{
			{"src": readBase64(iconPath, "image/png"), "sizes": sizes, "type": "image/png"},
		}
	}
	m["start_url"] = "/"

	out, err := json.Marshal(m)
	if err != nil {
		panic(fmt.Sprintf("marshal manifest: %v", err))
	}
	dataURI := "data:application/manifest+json;base64," + base64.StdEncoding.EncodeToString(out)

	reManifest := regexp.MustCompile(`<link rel="manifest" href="[^"]*"[^>]*/?>`)
	return reManifest.ReplaceAllLiteralString(html, `<link rel="manifest" href="`+dataURI+`" />`)
}

func injectArchitecture(html, rootDir string) string {
	mdPath := filepath.Join(rootDir, "agents/architecture.md")
	md, err := os.ReadFile(mdPath)
	if err != nil {
		return html // no architecture.md — skip silently
	}
	block := "<!--\n" + string(md) + "\n-->\n"
	return strings.Replace(html, "<!doctype html>", "<!doctype html>\n"+block, 1)
}

func processHtml(src, rootDir string) string {
	// Embed manifest.json as a data: URI on the <link rel="manifest"> tag
	// (icon inlined too) instead of stripping it — see embedManifest below.
	src = embedManifest(src, rootDir)

	// NOTE: the SW-unregister <script> block is intentionally KEPT (not
	// stripped) in the woven build. dunno itself never registers a service
	// worker, but a *stale* one from an earlier session (e.g. testing an
	// older version of the app served over http from this same directory)
	// can silently keep serving cached, out-of-date assets over any page
	// loaded from that origin — with no console error, since it's just a
	// normal cache hit. The single-file build is exactly the artifact most
	// likely to be served standalone later, so it needs this cleanup even
	// more than the dev index.html does.

	// Inline favicon as base64 data URI.
	reIcon := regexp.MustCompile(`<link rel="icon" href="([^"]+)"[^>]*/?>`)
	src = reIcon.ReplaceAllStringFunc(src, func(match string) string {
		m := reIcon.FindStringSubmatch(match)
		if m == nil {
			return match
		}
		dataURI := readBase64(filepath.Join(rootDir, m[1]), "image/png")
		return `<link rel="icon" href="` + dataURI + `" type="image/png" />`
	})

	// Inline CSS files.
	reCSS := regexp.MustCompile(`<link rel="stylesheet" href="([^"]+)"[^>]*/?>`)
	src = reCSS.ReplaceAllStringFunc(src, func(match string) string {
		m := reCSS.FindStringSubmatch(match)
		if m == nil {
			return match
		}
		css := readText(filepath.Join(rootDir, m[1]))
		return "<style>\n" + css + "\n</style>"
	})

	// Inline plain <script src="..."> files.
	reScriptSrc := regexp.MustCompile(`<script src="([^"]+)"></script>`)
	src = reScriptSrc.ReplaceAllStringFunc(src, func(match string) string {
		m := reScriptSrc.FindStringSubmatch(match)
		if m == nil {
			return match
		}
		js := readText(filepath.Join(rootDir, m[1]))
		return "<script>\n" + js + "\n</script>"
	})

	// Replace ES module entry point with IIFE bundle.
	reModule := regexp.MustCompile(`<script type="module" src="js/main\.js"></script>`)
	src = reModule.ReplaceAllLiteralString(src, buildIifeBundle(rootDir))

	// Embed architecture reference for agents/extensions.
	src = injectArchitecture(src, rootDir)

	return src
}

// ── CSP hashing ────────────────────────────────────────────────────────────────
// Rather than relying on 'unsafe-inline' (which would let ANY injected inline
// script run — e.g. via a markdown/HTML-preview XSS in editor content), we
// compute a SHA-256 hash of every inline <script>/<style> block that actually
// ships in this build and allow-list exactly those hashes. Anything else
// inline is refused by the browser, no matter how it got onto the page.

var (
	reScriptBlock = regexp.MustCompile(`(?s)<script(?:\s[^>]*)?>(.*?)</script>`)
	reStyleBlock  = regexp.MustCompile(`(?s)<style(?:\s[^>]*)?>(.*?)</style>`)
)

func cspHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

// injectCSP scans the fully-assembled HTML for every inline <script> and
// <style> block, hashes each one, and inserts a Content-Security-Policy
// <meta> tag (built from those hashes) right after <meta charset>.
func injectCSP(html string) string {
	var scriptHashes, styleHashes []string

	for _, m := range reScriptBlock.FindAllStringSubmatch(html, -1) {
		// `type="module" src="..."` shouldn't remain after processHtml, but
		// skip any script tag that still carries a src attribute just in case.
		if strings.Contains(m[0][:len(m[0])-len(m[1])-len("</script>")], "src=") {
			continue
		}
		scriptHashes = append(scriptHashes, cspHash(m[1]))
	}
	for _, m := range reStyleBlock.FindAllStringSubmatch(html, -1) {
		styleHashes = append(styleHashes, cspHash(m[1]))
	}

	csp := "default-src 'self'; " +
		"script-src 'self' 'unsafe-eval' " + strings.Join(scriptHashes, " ") + "; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data:; font-src 'self' data:; " +
		"manifest-src 'self' data:; " +
		"connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"

	metaTag := fmt.Sprintf(`  <meta http-equiv="Content-Security-Policy" content="%s" />`+"\n", csp)

	reCharset := regexp.MustCompile(`(<meta charset="UTF-8" />\n)`)
	if reCharset.MatchString(html) {
		return reCharset.ReplaceAllString(html, "${1}"+strings.ReplaceAll(metaTag, "$", "$$"))
	}
	// Fallback: just after <head>.
	return regexp.MustCompile(`(<head>\n)`).ReplaceAllString(html, "${1}"+strings.ReplaceAll(metaTag, "$", "$$"))
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	outFlag := flag.String("out", "dist/dunno.html", "output file path")
	flag.Parse()

	rootDir, err := filepath.Abs(".")
	if err != nil {
		panic(err)
	}

	indexHtml := readText(filepath.Join(rootDir, "index.html"))
	result := processHtml(indexHtml, rootDir)
	// Only replace the sentinel in its declaration (`let VERSION = '...'`),
	// NOT every occurrence in the bundle: version.js's own loadVersion()
	// compares VERSION against the literal sentinel text at runtime to
	// detect whether it's still running unbundled — a blanket replace would
	// silently rewrite that comparison too and break the check.
	reVersionDecl := regexp.MustCompile(`let VERSION = '__DUNNO_VERSION__';`)
	result = reVersionDecl.ReplaceAllLiteralString(result,
		"let VERSION = '"+readManifestVersion(rootDir)+"';")
	// Must run last: hashes are computed over the exact final script/style
	// bytes, so nothing after this point may touch their contents.
	result = injectCSP(result)

	outPath, err := filepath.Abs(*outFlag)
	if err != nil {
		panic(err)
	}
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		panic(err)
	}
	if err := os.WriteFile(outPath, []byte(result), 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("✓ %s  (%d KB)\n", outPath, len(result)/1024)
}
