import { ProjectGallery } from "@/components/project-gallery";
import { faqs, site } from "@/content/site";

export default function Home() {
  return (
    <>
      <header className="site-header wrap">
        <a className="brand" href="#" aria-label={`${site.name} 首頁`}><span className="brand-symbol" aria-hidden="true">s</span>{site.name}</a>
        <nav aria-label="主要導覽"><a href="#work">探索作品</a><a href="#about">設計理念</a><a href="#faq">常見問題</a></nav>
      </header>
      <main id="main">
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-copy"><p className="intro">設計，從理解開始。</p><h1 id="hero-title">讓想法，<br />成為好用的體驗。</h1><p className="hero-description">把複雜的事情想清楚，讓每一次點擊更直覺。<br className="desktop-break" />從品牌的第一印象，到日常使用的每個細節。</p><a className="button" href="#work">探索概念作品 <span aria-hidden="true">↗</span></a></div>
          <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-orbit orbit-three" /><div className="art-center">s.</div><span className="art-caption">Ideas take shape.</span><span className="art-index">Seax / Design study</span></div>
          <div className="hero-foot"><span>品牌設計・數位體驗・網站開發</span><span>向下探索 <span aria-hidden="true">↓</span></span></div>
        </section>
        <section className="work-section wrap" id="work" aria-labelledby="work-title"><div className="section-heading"><h2 id="work-title">不同想法，<br />各有自己的樣子。</h2><p>從品牌到產品，探索介面的不同可能。<br />以下為概念展示，非真實客戶案例。</p></div><ProjectGallery /></section>
        <section className="about-section" id="about" aria-labelledby="about-title"><div className="wrap about-grid"><div><p className="intro">我們相信的設計</p><h2 id="about-title">好看是開始，<br />好用才是日常。</h2></div><div className="principles"><article><h3>先理解，再設計</h3><p>從使用者的需求出發，讓資訊清楚、動線自然，每個決定都有理由。</p></article><article><h3>讓細節恰到好處</h3><p>文字、留白與互動彼此配合，在不同螢幕上，都能自在閱讀與操作。</p></article><article><h3>保留成長的空間</h3><p>以一致的設計語言建立基礎，讓新的內容與功能能夠自然延伸。</p></article></div></div></section>
        <section className="faq-section wrap" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">你可能想知道</h2><div>{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">＋</span></summary><p>{faq.answer}</p></details>)}</div></section>
      </main>
      <footer className="site-footer wrap"><a className="brand" href="#">{site.name}</a><p>留給下一個好想法。</p><span>品牌概念展示 / 2026</span></footer>
    </>
  );
}
