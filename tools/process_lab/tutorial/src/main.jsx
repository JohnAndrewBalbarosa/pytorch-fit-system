import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ACTIONS, EVENTS, Joyride, STATUS } from "react-joyride";
import "./styles.css";

const PREFECT = "http://127.0.0.1:4200";
const links = {
  app: "http://127.0.0.1:3000/",
  api: "http://127.0.0.1:8000/docs",
  runs: `${PREFECT}/runs`,
  deployments: `${PREFECT}/deployments`,
  variables: `${PREFECT}/variables`,
  blocks: `${PREFECT}/blocks`,
  workPools: `${PREFECT}/work-pools`,
  concurrency: `${PREFECT}/concurrency-limits`,
  automations: `${PREFECT}/automations`,
  events: `${PREFECT}/events`,
};

const resources = [
  ["Variables", "Simple, visible defaults. Beginners usually only read these.", links.variables],
  ["Blocks", "Grouped local URLs and the read-only safety policy.", links.blocks],
  ["Work Pools", "Queues are preconfigured; full mode activates their local worker.", links.workPools],
  ["Concurrency", "Safety limits that prevent browser, scraper, and build collisions.", links.concurrency],
  ["Automations", "On failure, run API diagnostics. No emails or external writes.", links.automations],
  ["Event Feed", "A timeline of safe workflow events without credentials or private data.", links.events],
];

function ExternalLink({ children, href, className = "button secondary" }) {
  return <a className={className} href={href} rel="noreferrer" target="_blank">{children}<span aria-hidden="true">↗</span></a>;
}

function CopyCommand({ children }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <button className="copy" onClick={copy} type="button"><code>{children}</code><span>{copied ? "Copied" : "Copy"}</span></button>;
}

function App() {
  const [runTour, setRunTour] = useState(true);
  const [tourKey, setTourKey] = useState(0);
  const runId = useMemo(() => new URLSearchParams(window.location.search).get("run"), []);
  const graphUrl = runId ? `${PREFECT}/runs/flow-run/${encodeURIComponent(runId)}` : links.runs;
  const steps = useMemo(() => [
    { target: "[data-tour='welcome']", title: "Welcome — this is your Start Here page", content: "You do not need to learn every Prefect section. For normal use, start the lab, open a workflow graph, and inspect the orange human gates.", placement: "bottom" },
    { target: "[data-tour='start']", title: "One beginner command", content: "Use demo for the fastest local walkthrough. It uses synthetic data and disables external writes. Use up later when you specifically need real local Supabase auth testing." },
    { target: "[data-tour='workflow']", title: "The ordinary-user workflow", content: "The Major Member Experience is the best overview: account access → dashboard → career, events, community, profile, and privacy branches." },
    { target: "[data-tour='graph']", title: "This is the n8n-like view", content: "Open the fresh DAG, select any node for logs and results, and press F inside Prefect for fullscreen." },
    { target: "[data-tour='resources']", title: "Advanced sections are already configured", content: "You do not need to create these manually. They exist for safety, scheduling, diagnostics, and observability." },
    { target: "[data-tour='safety']", title: "Writes remain human-controlled", content: "Registration, uploads, applications, event registration, feedback delivery, and approvals are visible gates—not automatic actions." },
    { target: "[data-tour='restart']", title: "Restarting after shutdown", content: "Run the same demo command again. Press Ctrl+C in its terminal when you want to stop the whole stack." },
  ], []);
  const replay = () => {
    setRunTour(false);
    setTourKey((value) => value + 1);
    window.requestAnimationFrame(() => setRunTour(true));
  };
  const onEvent = useCallback((event, controls) => {
    if (event.action === ACTIONS.CLOSE) {
      setRunTour(false);
      controls.skip();
    }
    if (event.type === EVENTS.TOUR_END && [STATUS.FINISHED, STATUS.SKIPPED].includes(event.status)) {
      setRunTour(false);
    }
  }, []);

  return <>
    <Joyride
      continuous
      key={tourKey}
      locale={{ back: "Back", close: "Close", last: "Finish", next: "Next", nextWithProgress: "Next ({current} of {total})", skip: "Skip for now" }}
      onEvent={onEvent}
      options={{ backgroundColor: "#171717", blockTargetInteraction: true, buttons: ["back", "skip", "close", "primary"], closeButtonAction: "skip", overlayClickAction: false, overlayColor: "rgba(0,0,0,.78)", primaryColor: "#e8590c", showProgress: true, skipBeacon: true, spotlightPadding: 10, spotlightRadius: 14, textColor: "#fff7ed", width: 380, zIndex: 1000 }}
      run={runTour}
      scrollToFirstStep
      steps={steps}
      styles={{ buttonBack: { color: "#fff7ed" }, buttonClose: { color: "#fff7ed" }, buttonPrimary: { borderRadius: 9, fontWeight: 800 }, buttonSkip: { color: "#fff7ed", opacity: .68 }, tooltip: { border: "1px solid rgba(255,255,255,.13)", borderRadius: 16 }, tooltipContent: { lineHeight: 1.55, textAlign: "left" }, tooltipTitle: { textAlign: "left" } }}
    />
    <header className="topbar"><div className="brand"><span className="mark">P</span><div><strong>PyTorch FIT Process Lab</strong><small>Beginner control panel · local only</small></div></div><button className="button ghost" onClick={replay} type="button">Replay guided tour</button></header>
    <main>
      <section className="hero" data-tour="welcome"><div><span className="eyebrow">START HERE</span><h1>See the process.<br/><em>Skip the Prefect homework.</em></h1><p>Use this page for the simple path. Prefect remains the workflow engine and DAG viewer; this guide only tells you where to look.</p><div className="actions"><button className="button primary" onClick={replay} type="button">Start 7-step tour</button><ExternalLink href={links.app}>Open member app</ExternalLink></div></div><div className="hero-map" aria-label="Workflow summary"><span>Account</span><b>→</b><span>Dashboard</span><b>→</b><div><span>Career</span><span>Events</span><span>Privacy</span></div></div></section>

      <section className="grid two">
        <article className="card" data-tour="start"><div className="number">01</div><p className="kicker">Run it</p><h2>Start with one command</h2><p>From the repository root, use demo mode for learning and UI review.</p><CopyCommand>.cache/process-lab/venv/bin/pytorch-fit-process-lab demo</CopyCommand><details><summary>When should I use full mode?</summary><p>Use <code>pytorch-fit-process-lab up</code> only when Docker is running and you need local Supabase authentication or RLS verification.</p></details></article>
        <article className="card" data-tour="workflow"><div className="number">02</div><p className="kicker">Choose</p><h2>Use Major Member Experience first</h2><p>It is the ordinary-user overview. Demo creates this fresh graph directly. Use full mode when you want Prefect's queued Deployment Run buttons.</p><div className="actions"><ExternalLink href={links.deployments}>View deployments</ExternalLink><ExternalLink href={links.api} className="button ghost">API docs</ExternalLink></div></article>
      </section>

      <section className="graph-card" data-tour="graph"><div><p className="kicker">03 · Read the DAG</p><h2>Nodes are steps. Arrows are dependencies.</h2><p>Green means completed. A human-gate node means the lab stopped before a sensitive write. Click a node to inspect its state, logs, inputs, and result.</p><ul><li>Open the fresh graph generated during startup.</li><li>Press <kbd>F</kbd> for fullscreen.</li><li>Use Runs to return to earlier executions.</li></ul></div><div className="dag"><span>Landing</span><i/><span>Dashboard</span><i/><div><span>Career</span><span>Events</span><span>Privacy</span></div></div><div className="actions"><ExternalLink href={graphUrl} className="button primary">{runId ? "Open fresh DAG" : "Open latest runs"}</ExternalLink><ExternalLink href={links.runs}>All runs</ExternalLink></div></section>

      <section className="section" data-tour="resources"><div className="section-heading"><div><p className="kicker">04 · Already configured</p><h2>The six sections you asked about</h2></div><p>You normally read these; you do not need to set them up manually.</p></div><div className="resource-grid">{resources.map(([name, description, href]) => <a href={href} key={name} rel="noreferrer" target="_blank"><strong>{name}</strong><span>{description}</span><b>Open in Prefect ↗</b></a>)}</div></section>

      <section className="grid two bottom">
        <article className="card safety" data-tour="safety"><div className="number">05</div><p className="kicker">Safety</p><h2>Orange gates need a person</h2><p>The lab observes and explains. It does not create accounts, register for events, send feedback, upload resumes, continue applications, or submit them.</p></article>
        <article className="card" data-tour="restart"><div className="number">06</div><p className="kicker">Next time</p><h2>Restart and stop</h2><p>After a laptop shutdown, run the same <code>demo</code> command. Keep its terminal open. Press <kbd>Ctrl</kbd> + <kbd>C</kbd> once to stop the managed services.</p><CopyCommand>.cache/process-lab/venv/bin/pytorch-fit-process-lab demo</CopyCommand></article>
      </section>
    </main>
    <footer><span>Local developer tutorial · excluded from production builds</span><a href="http://127.0.0.1:4200" target="_blank" rel="noreferrer">Prefect home ↗</a></footer>
  </>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
