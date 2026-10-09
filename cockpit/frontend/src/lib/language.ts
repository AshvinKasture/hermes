const BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", md: "markdown", html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini", conf: "ini", cfg: "ini",
  xml: "xml", svg: "xml", sql: "sql", dockerfile: "dockerfile", txt: "plaintext", log: "plaintext", csv: "plaintext",
};

const BY_NAME: Record<string, string> = {
  dockerfile: "dockerfile", makefile: "shell", ".bashrc": "shell", ".profile": "shell", ".zshrc": "shell", ".bash_profile": "shell",
  ".gitignore": "plaintext", ".env": "ini", caddyfile: "plaintext",
};

/** Monaco language id for a file name. */
export function languageFor(name: string): string {
  const lower = name.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const i = lower.lastIndexOf(".");
  return i > 0 ? (BY_EXT[lower.slice(i + 1)] ?? "plaintext") : "plaintext";
}
