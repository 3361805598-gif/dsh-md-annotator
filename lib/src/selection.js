// ── text-selection helpers ──────────────────────────────────────────────
// Selection offsets are computed against an annotatable unit's content subtree
// (the `.mdan-content` element carrying `data-mdan-ref`), so they stay stable
// across re-renders of the same block source and are never skewed by the
// control buttons / note chips that live outside that subtree.

function subtreeTextLen(node) {
  if (node.nodeType === 3) return node.data.length
  let total = 0
  let child = node.firstChild
  while (child !== null) { total += subtreeTextLen(child); child = child.nextSibling }
  return total
}

// (node, offset) boundary → character offset within root's textContent.
// Handles both text-node offsets and element-node child indexes.
function boundaryOffset(root, node, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL, null)
  let count = 0
  let n
  while ((n = walker.nextNode()) !== null) {
    if (n === node) {
      if (n.nodeType === 3) return count + offset
      let child = n.firstChild
      let skipped = 0
      while (child !== null && skipped < offset) { count += subtreeTextLen(child); child = child.nextSibling; skipped++ }
      return count
    }
    if (n.nodeType === 3) count += n.data.length
  }
  return null
}

// Character offsets within root.textContent → DOM Range spanning them.
function rangeFromOffsets(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let count = 0
  let t, startNode = null, startOff = 0, endNode = null, endOff = 0
  while ((t = walker.nextNode()) !== null) {
    const len = t.data.length
    if (startNode === null && start <= count + len) { startNode = t; startOff = start - count }
    if (end <= count + len) { endNode = t; endOff = end - count; break }
    count += len
  }
  if (startNode === null || endNode === null) return null
  const r = document.createRange()
  r.setStart(startNode, startOff)
  r.setEnd(endNode, endOff)
  return r
}
