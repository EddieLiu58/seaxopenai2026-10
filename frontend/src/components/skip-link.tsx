"use client";
export default function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}
    >
      跳至主要內容
    </a>
  );
}
