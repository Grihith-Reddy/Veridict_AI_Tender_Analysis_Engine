from __future__ import annotations

from ..models import EvidenceGraph, EvidenceGraphEdge, EvidenceGraphNode, EvaluationResult


class EvidenceGraphEngine:
    def build(self, evaluations: list[EvaluationResult]) -> EvidenceGraph:
        nodes: list[EvidenceGraphNode] = []
        edges: list[EvidenceGraphEdge] = []
        seen = set()

        for result in evaluations:
            criterion_node = f"criterion:{result.criterion_id}"
            evidence_node = f"evidence:{result.bidder_id}:{result.criterion_id}"
            text_block_node = f"text:{result.evidence.doc_name}:{result.evidence.page_number}:{result.bidder_id}"
            document_node = f"doc:{result.evidence.doc_name}:{result.bidder_id}"

            self._add_node(
                nodes,
                seen,
                EvidenceGraphNode(
                    id=criterion_node,
                    type="criterion",
                    value=result.criterion_id,
                    source_reference=None,
                ),
            )
            self._add_node(
                nodes,
                seen,
                EvidenceGraphNode(
                    id=evidence_node,
                    type="evidence_record",
                    value=str(result.evidence.extracted_value),
                    source_reference=f"{result.evidence.doc_name}:{result.evidence.page_number}",
                ),
            )

            if result.evidence.doc_name:
                self._add_node(
                    nodes,
                    seen,
                    EvidenceGraphNode(
                        id=text_block_node,
                        type="text_block",
                        value=(result.evidence.raw_text or "")[:250],
                        source_reference=f"{result.evidence.doc_name}:{result.evidence.page_number}",
                    ),
                )
                self._add_node(
                    nodes,
                    seen,
                    EvidenceGraphNode(
                        id=document_node,
                        type="document",
                        value=result.evidence.doc_name,
                        source_reference=result.evidence.doc_name,
                    ),
                )

                edges.append(EvidenceGraphEdge(from_node=criterion_node, to_node=evidence_node))
                edges.append(EvidenceGraphEdge(from_node=evidence_node, to_node=text_block_node))
                edges.append(EvidenceGraphEdge(from_node=text_block_node, to_node=document_node))
            else:
                edges.append(EvidenceGraphEdge(from_node=criterion_node, to_node=evidence_node))

        return EvidenceGraph(nodes=nodes, edges=edges)

    @staticmethod
    def _add_node(nodes: list[EvidenceGraphNode], seen: set[str], node: EvidenceGraphNode) -> None:
        if node.id in seen:
            return
        seen.add(node.id)
        nodes.append(node)
