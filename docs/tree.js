import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = 920;
const margin = { top: 24, right: 160, bottom: 24, left: 170 };
const rowHeight = 54;

const container = d3.select("#tree-view");
const select = d3.select("#tree-select");
const note = d3.select("#tree-note");
const meta = d3.select("#tree-meta");
const layoutButtons = d3.selectAll("[data-layout]");
let layoutMode = "horizontal";

const data = await fetch("./data/demo-trees.json").then((response) => response.json());

select
  .selectAll("option")
  .data(data.trees)
  .join("option")
  .attr("value", (tree) => tree.id)
  .text((tree) => `${tree.id} ${tree.title}`);

select.on("change", () => {
  render(data.trees.find((tree) => tree.id === select.property("value")));
});

layoutButtons.on("click", (event) => {
  layoutMode = event.currentTarget.dataset.layout;
  layoutButtons.classed("active", function () {
    return this.dataset.layout === layoutMode;
  });
  render(data.trees.find((tree) => tree.id === select.property("value")));
});

render(data.trees[0]);

function render(tree) {
  note.text(tree.note);
  meta.text(`${statusLabel(tree.status)}${tree.implementation ? `; selected ${tree.implementation}` : ""}`);

  const root = d3.hierarchy(tree.root);
  if (layoutMode === "radial") {
    renderRadial(root, tree);
  } else {
    renderHorizontal(root, tree);
  }
}

function renderHorizontal(root, tree) {
  const height = Math.max(260, root.descendants().length * rowHeight);
  const layout = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
  layout(root);
  container.selectAll("*").remove();
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `Composition tree for ${tree.id}`);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("fill", "none")
    .attr("stroke", "#8b938b")
    .attr("stroke-width", 1.4)
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("d", d3.linkHorizontal().x((d) => d.y).y((d) => d.x));

  const node = g
    .append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node
    .append("circle")
    .attr("r", 7)
    .attr("class", (d) => `tree-node ${d.data.kind}`);

  node
    .append("text")
    .attr("dy", "0.32em")
    .attr("x", (d) => (d.children ? -13 : 13))
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .text((d) => d.data.name);
}

function renderRadial(root, tree) {
  const radius = 330;
  const labelGap = 18;
  const size = 980;
  const layout = d3.tree().size([2 * Math.PI, radius]);
  layout(root);

  container.selectAll("*").remove();
  const svg = container
    .append("svg")
    .attr("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`)
    .attr("role", "img")
    .attr("aria-label", `Radial composition tree for ${tree.id}`);

  svg
    .append("g")
    .attr("fill", "none")
    .attr("stroke", "#8b938b")
    .attr("stroke-width", 1.2)
    .selectAll("path")
    .data(root.links())
    .join("path")
    .attr("d", d3.linkRadial().angle((d) => d.x).radius((d) => d.y));

  const labelData = separatedRadialLabels(root.descendants(), labelGap, size);

  const node = svg
    .append("g")
    .selectAll("g")
    .data(root.descendants())
    .join("g")
    .attr("transform", (d) => {
      const [x, y] = radialPoint(d);
      return `translate(${x},${y})`;
    });

  node
    .append("circle")
    .attr("r", 6)
    .attr("class", (d) => `tree-node ${d.data.kind}`);

  const labelLayer = svg.append("g");

  labelLayer
    .append("g")
    .attr("stroke", "#c1c7c1")
    .attr("stroke-width", 1)
    .selectAll("line")
    .data(labelData)
    .join("line")
    .attr("x1", (d) => d.nodeX)
    .attr("y1", (d) => d.nodeY)
    .attr("x2", (d) => d.labelX - d.side * 6)
    .attr("y2", (d) => d.labelY);

  labelLayer
    .append("g")
    .selectAll("text")
    .data(labelData)
    .join("text")
    .attr("x", (d) => d.labelX)
    .attr("y", (d) => d.labelY)
    .attr("dy", "0.32em")
    .attr("text-anchor", (d) => (d.side > 0 ? "start" : "end"))
    .text((d) => truncateLabel(d.data.name))
    .append("title")
    .text((d) => d.data.name);
}

function radialPoint(d) {
  const angle = d.x - Math.PI / 2;
  return [d.y * Math.cos(angle), d.y * Math.sin(angle)];
}

function separatedRadialLabels(nodes, minGap, size) {
  const limit = size / 2 - 26;
  const labels = nodes.map((d) => {
    const [nodeX, nodeY] = radialPoint(d);
    const side = nodeX >= 0 ? 1 : -1;
    return {
      ...d,
      nodeX,
      nodeY,
      side,
      labelX: nodeX + side * 14,
      labelY: nodeY
    };
  });

  for (const side of [-1, 1]) {
    const group = labels.filter((d) => d.side === side).sort((a, b) => a.labelY - b.labelY);
    for (let index = 1; index < group.length; index += 1) {
      group[index].labelY = Math.max(group[index].labelY, group[index - 1].labelY + minGap);
    }
    const overflow = group.length > 0 ? group[group.length - 1].labelY - limit : 0;
    if (overflow > 0) {
      for (const label of group) {
        label.labelY -= overflow;
      }
    }
    for (let index = 1; index < group.length; index += 1) {
      group[index].labelY = Math.max(group[index].labelY, group[index - 1].labelY + minGap);
    }
  }
  return labels;
}

function truncateLabel(label) {
  return label.length > 58 ? `${label.slice(0, 55)}...` : label;
}

function statusLabel(status) {
  if (status === "composition_closed_relative") {
    return "compositionally closed relative to listed primitives";
  }
  if (status === "open_frontier") {
    return "open frontier";
  }
  return status;
}
