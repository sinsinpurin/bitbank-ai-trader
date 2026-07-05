"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Grid, GridItem, HStack, Input, Stack, Text } from "@chakra-ui/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  evaluateGraph,
  type GeneratedStrategy,
  type NodeLiveValue,
  type Strategy,
  type StrategyGraph,
  type StrategyNodeType,
} from "@bitbank-ai-trader/shared";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { CyberButton } from "@/components/ui/CyberButton";
import { BlueprintNodeView, type BlueprintFlowNode } from "@/components/strategy/BlueprintNode";
import { NodePalette, DND_MIME } from "@/components/strategy/NodePalette";
import { StrategyList } from "@/components/strategy/StrategyList";
import { BotSignalFeed } from "@/components/strategy/BotSignalFeed";
import { TemplateGallery } from "@/components/strategy/TemplateGallery";
import { AiGeneratePanel } from "@/components/strategy/AiGeneratePanel";
import { StrategyPreview } from "@/components/strategy/StrategyPreview";
import { describeGraph } from "@/components/strategy/describeGraph";
import { STRATEGY_TEMPLATES, type StrategyTemplate } from "@/components/strategy/strategyTemplates";
import { NODE_CATALOG, NODE_DEF_BY_TYPE, type PortKind } from "@/components/strategy/nodeCatalog";
import { LiveValuesContext } from "@/components/strategy/LiveValuesContext";
import { createStrategy, deleteStrategy, fetchStrategies, updateStrategy } from "@/lib/strategyApi";
import { useLiveCandles } from "@/lib/useLiveCandles";
import { useServerEvents } from "@/lib/useServerEvents";

const nodeTypes: NodeTypes = Object.fromEntries(
  NODE_CATALOG.map((def) => [def.type, BlueprintNodeView])
);
const edgeTypes: EdgeTypes = {};

const EDGE_STYLE = { stroke: "rgba(0,229,255,0.65)", strokeWidth: 1.5 };

let idCounter = 0;
function nextId(type: string) {
  idCounter += 1;
  return `${type}_${Date.now().toString(36)}_${idCounter}`;
}

function portKind(
  nodeType: string | undefined,
  handleId: string | null | undefined,
  direction: "source" | "target"
): PortKind | null {
  const def = NODE_DEF_BY_TYPE.get(nodeType as StrategyNodeType);
  if (!def) return null;
  const ports = direction === "source" ? def.outputs : def.inputs;
  const port = ports.find((p) => p.id === (handleId ?? ports[0]?.id));
  return port?.kind ?? null;
}

function toGraph(nodes: BlueprintFlowNode[], edges: Edge[]): StrategyGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as StrategyNodeType,
      params: n.data.params ?? {},
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? null,
      target: e.target,
      targetHandle: e.targetHandle ?? null,
    })),
  };
}

function fromGraph(graph: StrategyGraph): { nodes: BlueprintFlowNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { params: n.params ?? {} },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? undefined,
      target: e.target,
      targetHandle: e.targetHandle ?? undefined,
      style: EDGE_STYLE,
    })),
  };
}

function StrategyEditor() {
  // 初期表示はテンプレート先頭(SMAゴールデンクロス)を展開しておく
  const initial = useMemo(() => fromGraph(STRATEGY_TEMPLATES[0].graph), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlueprintFlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(STRATEGY_TEMPLATES[0].name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "cyan" | "red" } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const { botSignals } = useServerEvents([]);

  const refreshList = useCallback(async () => {
    try {
      setStrategies(await fetchStrategies());
    } catch {
      setMessage({ text: "戦略一覧の取得に失敗しました。サーバーは起動していますか?", tone: "red" });
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const notify = useCallback((text: string, tone: "cyan" | "red" = "cyan") => {
    setMessage({ text, tone });
  }, []);

  const nodeTypeById = useCallback(
    (id: string) => nodes.find((n) => n.id === id)?.type,
    [nodes]
  );

  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return false;
      const sourceKind = portKind(nodeTypeById(conn.source), conn.sourceHandle, "source");
      const targetKind = portKind(nodeTypeById(conn.target), conn.targetHandle, "target");
      return sourceKind !== null && targetKind !== null && sourceKind === targetKind;
    },
    [nodeTypeById]
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((prev) =>
        addEdge(
          { ...conn, style: EDGE_STYLE },
          // 同じ入力ハンドルへの既存接続は張り替える
          prev.filter(
            (e) => !(e.target === conn.target && (e.targetHandle ?? null) === (conn.targetHandle ?? null))
          )
        )
      );
    },
    [setEdges]
  );

  const addNode = useCallback(
    (type: StrategyNodeType, position?: { x: number; y: number }) => {
      const def = NODE_DEF_BY_TYPE.get(type);
      if (!def) return;
      const fallback = { x: 120 + Math.random() * 160, y: 80 + Math.random() * 160 };
      setNodes((prev) => [
        ...prev,
        {
          id: nextId(type),
          type,
          position: position ?? fallback,
          data: { params: { ...def.defaultParams } },
        },
      ]);
    },
    [setNodes]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(DND_MIME) as StrategyNodeType;
      if (!type) return;
      addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, screenToFlowPosition]
  );

  const validate = useCallback((): string | null => {
    if (!name.trim()) return "戦略名を入力してください";
    const hasAction = nodes.some((n) => n.type === "buy" || n.type === "sell");
    if (!hasAction) return "Buy / Sell ノードを最低1つ配置してください";
    const actionConnected = edges.some((e) => {
      const t = nodeTypeById(e.target);
      return t === "buy" || t === "sell";
    });
    if (!actionConnected) return "Buy / Sell ノードに条件を接続してください";
    return null;
  }, [name, nodes, edges, nodeTypeById]);

  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      notify(error, "red");
      return;
    }
    setSaving(true);
    try {
      const graph = toGraph(nodes, edges);
      if (selectedId) {
        await updateStrategy(selectedId, { name: name.trim(), graph });
        notify("戦略を上書き保存しました");
      } else {
        const created = await createStrategy({ name: name.trim(), graph });
        setSelectedId(created.id);
        notify("戦略を保存しました。Deployで稼働開始できます");
      }
      await refreshList();
    } catch (err) {
      notify(err instanceof Error ? err.message : "保存に失敗しました", "red");
    } finally {
      setSaving(false);
    }
  }, [validate, nodes, edges, selectedId, name, notify, refreshList]);

  const handleLoad = useCallback(
    (strategy: Strategy) => {
      const { nodes: n, edges: e } = fromGraph(strategy.graph);
      setNodes(n);
      setEdges(e);
      setSelectedId(strategy.id);
      setName(strategy.name);
      notify(`戦略 "${strategy.name}" を読み込みました`);
    },
    [setNodes, setEdges, notify]
  );

  const handleNew = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setName("NEW STRATEGY");
  }, [setNodes, setEdges]);

  const handleToggleActive = useCallback(
    async (strategy: Strategy) => {
      try {
        await updateStrategy(strategy.id, { isActive: !strategy.isActive });
        notify(
          strategy.isActive
            ? `戦略 "${strategy.name}" を停止しました`
            : `戦略 "${strategy.name}" を稼働開始しました`
        );
        await refreshList();
      } catch (err) {
        notify(err instanceof Error ? err.message : "更新に失敗しました", "red");
      }
    },
    [notify, refreshList]
  );

  // キャンバス上のグラフを日本語の戦略説明へ変換(編集に追従)
  const preview = useMemo(() => describeGraph(toGraph(nodes, edges)), [nodes, edges]);

  // 現在の相場データ(サーバーの1分足履歴)で各ノードを評価し、◯/✕・数値をライブ表示する
  const closes = useLiveCandles();
  const liveValues = useMemo<Record<string, NodeLiveValue> | null>(() => {
    if (closes.length < 2) return null;
    return evaluateGraph(toGraph(nodes, edges), closes, { collectValues: true }).nodeValues;
  }, [nodes, edges, closes]);

  const handleLoadTemplate = useCallback(
    (template: StrategyTemplate) => {
      if (
        nodes.length > 0 &&
        !window.confirm(`キャンバスをテンプレート「${template.name}」で置き換えます。よろしいですか?`)
      ) {
        return;
      }
      const { nodes: n, edges: e } = fromGraph(template.graph);
      setNodes(n);
      setEdges(e);
      setSelectedId(null);
      setName(template.name);
      notify(`テンプレート「${template.name}」を展開しました。SaveするとDeployできます`);
      window.requestAnimationFrame(() => fitView({ padding: 0.15 }));
    },
    [nodes.length, setNodes, setEdges, notify, fitView]
  );

  const handleGenerated = useCallback(
    (result: GeneratedStrategy) => {
      if (
        nodes.length > 0 &&
        !window.confirm(`キャンバスをAI生成の戦略「${result.name}」で置き換えます。よろしいですか?`)
      ) {
        return;
      }
      const { nodes: n, edges: e } = fromGraph(result.graph);
      setNodes(n);
      setEdges(e);
      setSelectedId(null);
      setName(result.name);
      notify(
        `AIが戦略「${result.name}」を生成しました(推定コスト ¥${result.usage.estimatedCostJpy.toFixed(2)})。内容を確認してSaveしてください`
      );
      window.requestAnimationFrame(() => fitView({ padding: 0.15 }));
    },
    [nodes.length, setNodes, setEdges, notify, fitView]
  );

  const handleDelete = useCallback(
    async (strategy: Strategy) => {
      if (!window.confirm(`戦略 "${strategy.name}" を削除しますか?`)) return;
      try {
        await deleteStrategy(strategy.id);
        if (selectedId === strategy.id) setSelectedId(null);
        notify(`戦略 "${strategy.name}" を削除しました`);
        await refreshList();
      } catch (err) {
        notify(err instanceof Error ? err.message : "削除に失敗しました", "red");
      }
    },
    [selectedId, notify, refreshList]
  );

  return (
    <LiveValuesContext.Provider value={liveValues}>
    <Grid
      templateColumns={{ base: "1fr", lg: "200px 1fr 300px" }}
      gap={6}
      px={{ base: 4, md: 10 }}
      py={8}
      flex="1"
    >
      <GridItem>
        <CyberPanel title="Node Palette" code="01 / KIT" accent="cyan" collapsible>
          <NodePalette onAdd={(type) => addNode(type)} />
        </CyberPanel>
      </GridItem>

      <GridItem minW={0}>
        <Stack gap={4} height="100%">
          <HStack gap={3} flexWrap="wrap">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="STRATEGY NAME"
              maxW="320px"
              bg="bg.surface"
              borderColor="border.gridCyan"
              borderRadius="0"
              fontFamily="heading"
              fontSize="13px"
              letterSpacing="0.1em"
              textTransform="uppercase"
              color="text.primary"
              _focus={{ borderColor: "signal.cyan", boxShadow: "glowCyanSm" }}
            />
            <CyberButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedId ? "Update" : "Save"}
            </CyberButton>
            <CyberButton variant="ghost" onClick={handleNew}>
              New
            </CyberButton>
            {message && (
              <Text
                fontFamily="mono"
                fontSize="11px"
                color={message.tone === "red" ? "signal.red" : "signal.cyan"}
              >
                {message.text}
              </Text>
            )}
          </HStack>

          <Box
            ref={canvasRef}
            flex="1"
            minH="520px"
            borderWidth="1px"
            borderColor="border.gridCyan"
            position="relative"
            css={{
              "& .react-flow": { background: "#0A0A0D" },
              "& .react-flow__attribution": { background: "transparent", color: "#4B4B55" },
              "& .react-flow__controls": {
                boxShadow: "none",
                border: "1px solid rgba(0,229,255,0.22)",
              },
              "& .react-flow__controls-button": {
                background: "#131318",
                borderBottom: "1px solid rgba(0,229,255,0.22)",
                fill: "#9A9AA6",
              },
              "& .react-flow__controls-button:hover": { background: "#1C1C24" },
              "& .react-flow__edge.selected .react-flow__edge-path": {
                stroke: "#FCEE0A",
              },
            }}
          >
            {/* corner brackets */}
            <Box position="absolute" top="-1px" left="-1px" width="16px" height="16px" borderTop="2px solid #00E5FF" borderLeft="2px solid #00E5FF" zIndex={5} pointerEvents="none" />
            <Box position="absolute" bottom="-1px" right="-1px" width="16px" height="16px" borderBottom="2px solid #00E5FF" borderRight="2px solid #00E5FF" zIndex={5} pointerEvents="none" />

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              defaultEdgeOptions={{ style: EDGE_STYLE }}
              proOptions={{ hideAttribution: false }}
              fitView
              deleteKeyCode={["Backspace", "Delete"]}
              colorMode="dark"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.5}
                color="rgba(0,229,255,0.18)"
                bgColor="#0A0A0D"
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          </Box>

          <Text fontFamily="mono" fontSize="10px" color="text.disabled">
            パレットをクリック or ドラッグ&ドロップで配置 / ポート同士をドラッグで接続 /
            Backspaceで選択要素を削除。シアン◈=数値、オレンジ◈=条件(真偽)。{" "}
            {liveValues
              ? `LIVE: 1分足×${closes.length}本で各ノードを評価中(10秒ごと更新)`
              : "LIVE評価は停止中(サーバー未接続またはデータ蓄積中)"}
          </Text>

          <CyberPanel title="Strategy Preview" code="02 / 意訳" accent="cyan" collapsible>
            <StrategyPreview description={preview} />
          </CyberPanel>
        </Stack>
      </GridItem>

      <GridItem>
        <Stack gap={6}>
          <CyberPanel title="AI Strategy Gen" code="03 / GEN" accent="red">
            <AiGeneratePanel onGenerated={handleGenerated} />
          </CyberPanel>
          <CyberPanel title="Strategy Templates" code="04 / LIB" accent="cyan" collapsible>
            <Box maxH="380px" overflowY="auto" pr={1}>
              <TemplateGallery onLoad={handleLoadTemplate} />
            </Box>
          </CyberPanel>
          <CyberPanel title="Deployed Strategies" code="05 / OPS" accent="red" collapsible>
            <Box maxH="360px" overflowY="auto" pr={1}>
              <StrategyList
                strategies={strategies}
                selectedId={selectedId}
                onLoad={handleLoad}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            </Box>
          </CyberPanel>
          <CyberPanel title="Bot Signal Feed" code="06 / SIG" accent="cyan" collapsible>
            <BotSignalFeed signals={botSignals} />
          </CyberPanel>
        </Stack>
      </GridItem>
    </Grid>
    </LiveValuesContext.Provider>
  );
}

export default function StrategiesPage() {
  return (
    <Box minH="100vh" display="flex" flexDirection="column">
      <AppHeader />
      <ReactFlowProvider>
        <StrategyEditor />
      </ReactFlowProvider>
    </Box>
  );
}
