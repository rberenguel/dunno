// bundle.go — produces dist/dunno.html: a single-file, zero-dependency dunno editor.
//
//   go run bundle.go
//   go run bundle.go --out dunno.html

package main

import (
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
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

func processHtml(src, rootDir string) string {
	// Remove <link rel="manifest" ...>
	src = regexp.MustCompile(`\s*<link rel="manifest"[^>]*/?>`).ReplaceAllString(src, "")

	// Remove SW unregister <script> block.
	src = regexp.MustCompile(`(?s)\s*<script>\s*if\s*\('serviceWorker'\s+in\s+navigator\).*?</script>`).
		ReplaceAllString(src, "")

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

	return src
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
	result = strings.ReplaceAll(result, "__DUNNO_VERSION__", readManifestVersion(rootDir))

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
