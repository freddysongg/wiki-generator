"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BatchManifest, ManifestPage } from "@/lib/types";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-2d";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const GRAPH_HEIGHT_PX = 480;
const GRAPH_FALLBACK_WIDTH_PX = 720;
const NODE_RADIUS_MIN_PX = 3;
const NODE_RADIUS_MAX_PX = 14;
const NODE_RADIUS_BASE_PX = 3;
const NODE_RADIUS_DEGREE_FACTOR = 1.2;
const NODE_HOVER_SCALE = 1.4;
const NODE_HIT_RADIUS_PX = 14;
const NODE_LABEL_GAP_PX = 6;
const LABEL_FONT_PX = 11;
const LABEL_TRUNCATE_CHARS = 22;
const LABEL_VISIBLE_ZOOM = 1.5;
const LABEL_FONT_FAMILY = "Inter, system-ui, sans-serif";
const NODE_REL_SIZE = 8;
const LINK_ALPHA = 0.18;
const LINK_WIDTH = 0.5;

const FORCE_NODE_COUNT_MIN = 100;
const FORCE_NODE_COUNT_MAX = 1500;
const CHARGE_STRENGTH_MIN = -260;
const CHARGE_STRENGTH_MAX = -1200;
const LINK_DISTANCE_MIN = 90;
const LINK_DISTANCE_MAX = 220;
const COOLDOWN_TICKS_MIN = 240;
const COOLDOWN_TICKS_MAX = 800;
const CENTER_STRENGTH_MIN = 0.05;
const CENTER_STRENGTH_MAX = 0.25;

interface ForceParams {
  chargeStrength: number;
  linkDistance: number;
  cooldownTicks: number;
  centerStrength: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeForceParams(nodeCount: number): ForceParams {
  const span = FORCE_NODE_COUNT_MAX - FORCE_NODE_COUNT_MIN;
  const ratio = clamp((nodeCount - FORCE_NODE_COUNT_MIN) / span, 0, 1);
  const chargeStrength =
    CHARGE_STRENGTH_MIN + (CHARGE_STRENGTH_MAX - CHARGE_STRENGTH_MIN) * ratio;
  const linkDistance =
    LINK_DISTANCE_MIN + (LINK_DISTANCE_MAX - LINK_DISTANCE_MIN) * ratio;
  const cooldownTicks = Math.round(
    COOLDOWN_TICKS_MIN + (COOLDOWN_TICKS_MAX - COOLDOWN_TICKS_MIN) * ratio,
  );
  const centerStrength =
    CENTER_STRENGTH_MIN + (CENTER_STRENGTH_MAX - CENTER_STRENGTH_MIN) * ratio;
  return { chargeStrength, linkDistance, cooldownTicks, centerStrength };
}

function nodeRadiusForDegree(degree: number): number {
  const raw =
    NODE_RADIUS_BASE_PX + Math.sqrt(degree) * NODE_RADIUS_DEGREE_FACTOR;
  return clamp(raw, NODE_RADIUS_MIN_PX, NODE_RADIUS_MAX_PX);
}

interface GraphPreviewProps {
  batchId: string;
  height?: number;
}

interface GraphNodeData {
  id: string;
  label: string;
}

interface GraphLinkData {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNodeData[];
  links: GraphLinkData[];
}

type GraphNode = NodeObject;
type GraphHandle = ForceGraphMethods;

interface ForceSimulation {
  strength?: (value: number) => ForceSimulation;
  distance?: (value: number) => ForceSimulation;
}

interface NodeWithCoords {
  id: unknown;
  label?: unknown;
  x?: number;
  y?: number;
}

interface BuiltGraph {
  data: GraphData;
  externalLinkCount: number;
  outgoingByTitle: Map<string, number>;
  incomingByTitle: Map<string, number>;
  degreeByTitle: Map<string, number>;
  pageByTitle: Map<string, ManifestPage>;
}

interface ThemeColors {
  ink: string;
  terracotta: string;
  lineSoft: string;
  paper2: string;
}

type GraphState =
  | { kind: "loading" }
  | { kind: "loaded"; manifest: BatchManifest }
  | { kind: "empty" }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function readThemeColors(): ThemeColors {
  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--fg").trim() || "#e6dfcd";
  const accent = styles.getPropertyValue("--accent").trim() || "#c25a3a";
  const rule = styles.getPropertyValue("--rule").trim() || "#4a463d";
  const bg2 = styles.getPropertyValue("--bg-2").trim() || "#25221e";
  return { ink: fg, terracotta: accent, lineSoft: rule, paper2: bg2 };
}

function buildGraph(manifest: BatchManifest): BuiltGraph {
  const pageByTitle = new Map<string, ManifestPage>();
  for (const page of manifest.pages) pageByTitle.set(page.title, page);

  const nodes: GraphNodeData[] = manifest.pages.map((page) => ({
    id: page.title,
    label: page.title,
  }));

  const links: GraphLinkData[] = [];
  const outgoingByTitle = new Map<string, number>();
  const incomingByTitle = new Map<string, number>();
  let externalLinkCount = 0;

  for (const page of manifest.pages) {
    for (const target of page.links) {
      if (pageByTitle.has(target)) {
        links.push({ source: page.title, target });
        outgoingByTitle.set(
          page.title,
          (outgoingByTitle.get(page.title) ?? 0) + 1,
        );
        incomingByTitle.set(target, (incomingByTitle.get(target) ?? 0) + 1);
      } else {
        externalLinkCount += 1;
      }
    }
  }

  const degreeByTitle = new Map<string, number>();
  for (const page of manifest.pages) {
    const outgoing = outgoingByTitle.get(page.title) ?? 0;
    const incoming = incomingByTitle.get(page.title) ?? 0;
    degreeByTitle.set(page.title, outgoing + incoming);
  }

  return {
    data: { nodes, links },
    externalLinkCount,
    outgoingByTitle,
    incomingByTitle,
    degreeByTitle,
    pageByTitle,
  };
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

interface MetaLineProps {
  nodeCount: number;
  edgeCount: number;
  externalCount: number;
}

function MetaLine({
  nodeCount,
  edgeCount,
  externalCount,
}: MetaLineProps): JSX.Element {
  return (
    <span className="t-meta text-fg-mute num-tabular">
      {nodeCount} {pluralize(nodeCount, "concept", "concepts")} · {edgeCount}{" "}
      {pluralize(edgeCount, "link", "links")} · {externalCount} external{" "}
      {pluralize(externalCount, "link", "links")}
    </span>
  );
}

interface InspectorPanelProps {
  page: ManifestPage;
  outgoingCount: number;
  incomingCount: number;
  onClose: () => void;
}

function InspectorPanel({
  page,
  outgoingCount,
  incomingCount,
  onClose,
}: InspectorPanelProps): JSX.Element {
  return (
    <div
      className={cn(
        "absolute top-3 right-3 z-10 max-w-[280px] flex flex-col gap-2",
        "bg-bg border-[1.5px] border-rule p-3",
      )}
      role="dialog"
      aria-label={`details for ${page.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="t-eyebrow text-fg-mute">CONCEPT</span>
        <button
          type="button"
          aria-label="close"
          onClick={onClose}
          className="t-meta text-fg-mute hover:text-fg leading-none"
        >
          ×
        </button>
      </div>
      <span className="t-body text-fg break-words">{page.title}</span>
      <dl className="flex flex-col gap-1 t-meta text-fg-mute">
        <div className="flex justify-between gap-3">
          <dt>Source</dt>
          <dd className="text-fg truncate" title={page.source}>
            {page.source}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Pages</dt>
          <dd className="text-fg num-tabular">{page.sourcePages}</dd>
        </div>
        {page.aliases.length > 0 ? (
          <div className="flex justify-between gap-3">
            <dt>Aliases</dt>
            <dd className="text-fg break-words text-right">
              {page.aliases.join(", ")}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Outgoing</dt>
          <dd className="text-fg num-tabular">{outgoingCount}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Incoming</dt>
          <dd className="text-fg num-tabular">{incomingCount}</dd>
        </div>
      </dl>
    </div>
  );
}

export function GraphPreview(props: GraphPreviewProps): JSX.Element {
  const { batchId } = props;
  const containerHeight = props.height ?? GRAPH_HEIGHT_PX;
  const [state, setState] = useState<GraphState>({ kind: "loading" });
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeColors | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [retryToken, setRetryToken] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphHandle | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setState({ kind: "loading" });
    setSelectedTitle(null);

    const run = async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batchId)}`,
          { signal },
        );
        if (signal.aborted) return;
        if (response.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        if (!response.ok) {
          setState({
            kind: "error",
            message: `request failed (${response.status})`,
          });
          return;
        }
        const manifest = (await response.json()) as BatchManifest;
        if (signal.aborted) return;
        if (manifest.pages.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "loaded", manifest });
      } catch (err) {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : "network error";
        setState({ kind: "error", message });
      }
    };
    void run();
    return () => controller.abort();
  }, [batchId, retryToken]);

  useEffect(() => {
    setTheme(readThemeColors());
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = (): void => {
      setContainerWidth(node.clientWidth);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const built = useMemo<BuiltGraph | null>(() => {
    if (state.kind !== "loaded") return null;
    return buildGraph(state.manifest);
  }, [state]);

  const forceParams = useMemo<ForceParams>(
    () => computeForceParams(built?.data.nodes.length ?? 0),
    [built],
  );

  useEffect(() => {
    if (!built) return;
    const handle = graphRef.current;
    if (!handle || typeof handle.d3Force !== "function") return;
    const charge = handle.d3Force("charge") as ForceSimulation | undefined;
    const link = handle.d3Force("link") as ForceSimulation | undefined;
    const center = handle.d3Force("center") as ForceSimulation | undefined;
    charge?.strength?.(forceParams.chargeStrength);
    link?.distance?.(forceParams.linkDistance);
    center?.strength?.(forceParams.centerStrength);
    handle.d3ReheatSimulation?.();
  }, [built, forceParams]);

  const handleEngineStop = useCallback((): void => {
    const handle = graphRef.current;
    if (!handle || typeof handle.zoomToFit !== "function") return;
    handle.zoomToFit(400, 60);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode): void => {
    if (typeof node.id !== "string") return;
    setSelectedTitle(node.id);
  }, []);

  const handleBackgroundClick = useCallback((): void => {
    setSelectedTitle(null);
  }, []);

  const handleNodeHover = useCallback((node: GraphNode | null): void => {
    if (!node || typeof node.id !== "string") {
      setHoveredTitle(null);
      return;
    }
    setHoveredTitle(node.id);
  }, []);

  const drawNode = useCallback(
    (
      node: GraphNode,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ): void => {
      if (!theme || !built) return;
      if (typeof node.x !== "number" || typeof node.y !== "number") return;
      if (typeof node.id !== "string") return;
      const isAccented = node.id === hoveredTitle || node.id === selectedTitle;
      const degree = built.degreeByTitle.get(node.id) ?? 0;
      const baseRadiusPx = nodeRadiusForDegree(degree);
      const radiusPx = isAccented
        ? baseRadiusPx * NODE_HOVER_SCALE
        : baseRadiusPx;
      const radiusWorld = radiusPx / globalScale;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radiusWorld, 0, 2 * Math.PI);
      ctx.fillStyle = isAccented ? theme.terracotta : theme.ink;
      ctx.fill();
    },
    [theme, hoveredTitle, selectedTitle, built],
  );

  const drawLabelsOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number): void => {
      if (!theme || !built) return;
      const showAllLabels = globalScale >= LABEL_VISIBLE_ZOOM;
      if (!showAllLabels && hoveredTitle === null && selectedTitle === null) {
        return;
      }
      const nodes = built.data.nodes as unknown as NodeWithCoords[];
      const fontWorld = LABEL_FONT_PX / globalScale;
      ctx.font = `${fontWorld}px ${LABEL_FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const node of nodes) {
        if (typeof node.id !== "string" || typeof node.label !== "string") {
          continue;
        }
        if (typeof node.x !== "number" || typeof node.y !== "number") continue;
        const isAccented =
          node.id === hoveredTitle || node.id === selectedTitle;
        if (!isAccented && !showAllLabels) continue;
        const degree = built.degreeByTitle.get(node.id) ?? 0;
        const baseRadiusPx = nodeRadiusForDegree(degree);
        const radiusPx = isAccented
          ? baseRadiusPx * NODE_HOVER_SCALE
          : baseRadiusPx;
        const radiusWorld = radiusPx / globalScale;
        ctx.fillStyle = isAccented ? theme.terracotta : theme.ink;
        ctx.fillText(
          truncate(node.label, LABEL_TRUNCATE_CHARS),
          node.x,
          node.y + radiusWorld + NODE_LABEL_GAP_PX / globalScale,
        );
      }
    },
    [theme, hoveredTitle, selectedTitle, built],
  );

  const formatNodeLabel = useCallback(
    (node: GraphNode): string => {
      if (!built || typeof node.id !== "string") return "";
      const page = built.pageByTitle.get(node.id);
      if (!page) return node.id;
      const degree = built.degreeByTitle.get(node.id) ?? 0;
      return `${page.title} · ${degree} link${degree === 1 ? "" : "s"}`;
    },
    [built],
  );

  const drawLink = useCallback(
    (
      link: { source?: unknown; target?: unknown },
      ctx: CanvasRenderingContext2D,
    ): void => {
      if (!theme) return;
      const source = link.source as { x?: number; y?: number } | undefined;
      const target = link.target as { x?: number; y?: number } | undefined;
      if (
        !source ||
        !target ||
        typeof source.x !== "number" ||
        typeof source.y !== "number" ||
        typeof target.x !== "number" ||
        typeof target.y !== "number"
      ) {
        return;
      }
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = LINK_ALPHA;
      ctx.strokeStyle = theme.lineSoft;
      ctx.lineWidth = LINK_WIDTH;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.globalAlpha = previousAlpha;
    },
    [theme],
  );

  const retry = useCallback((): void => {
    setRetryToken((token) => token + 1);
  }, []);

  const selectedPage = useMemo<ManifestPage | null>(() => {
    if (!selectedTitle || !built) return null;
    return built.pageByTitle.get(selectedTitle) ?? null;
  }, [selectedTitle, built]);

  const nodeCount = built?.data.nodes.length ?? 0;
  const edgeCount = built?.data.links.length ?? 0;
  const externalCount = built?.externalLinkCount ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="t-eyebrow text-fg-mute">GRAPH</span>
        {state.kind === "loaded" ? (
          <MetaLine
            nodeCount={nodeCount}
            edgeCount={edgeCount}
            externalCount={externalCount}
          />
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="relative w-full bg-bg-2 border-[1.5px] border-rule overflow-hidden"
        style={{ height: containerHeight }}
      >
        {state.kind === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="t-meta text-fg-mute">loading graph…</span>
          </div>
        ) : null}
        {state.kind === "empty" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="t-meta text-fg-mute">
              no concepts in this batch.
            </span>
          </div>
        ) : null}
        {state.kind === "not-found" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="t-meta text-fg-mute">manifest unavailable.</span>
          </div>
        ) : null}
        {state.kind === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="t-meta text-fg-mute">failed to load graph.</span>
            <Button variant="ghost" size="sm" onClick={retry}>
              retry
            </Button>
          </div>
        ) : null}
        {state.kind === "loaded" && built && theme ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={built.data}
            width={
              containerWidth > 0 ? containerWidth : GRAPH_FALLBACK_WIDTH_PX
            }
            height={containerHeight}
            backgroundColor={theme.paper2}
            nodeId="id"
            nodeRelSize={NODE_REL_SIZE}
            cooldownTicks={forceParams.cooldownTicks}
            onEngineStop={handleEngineStop}
            linkColor={() => theme.lineSoft}
            linkWidth={LINK_WIDTH}
            linkCanvasObject={drawLink}
            nodeCanvasObject={drawNode}
            onRenderFramePost={drawLabelsOverlay}
            nodeLabel={formatNodeLabel}
            nodePointerAreaPaint={(
              node: GraphNode,
              color: string,
              ctx: CanvasRenderingContext2D,
              globalScale: number,
            ) => {
              if (typeof node.x !== "number" || typeof node.y !== "number")
                return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(
                node.x,
                node.y,
                NODE_HIT_RADIUS_PX / globalScale,
                0,
                2 * Math.PI,
              );
              ctx.fill();
            }}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
          />
        ) : null}
        {selectedPage && built ? (
          <InspectorPanel
            page={selectedPage}
            outgoingCount={built.outgoingByTitle.get(selectedPage.title) ?? 0}
            incomingCount={built.incomingByTitle.get(selectedPage.title) ?? 0}
            onClose={() => setSelectedTitle(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
