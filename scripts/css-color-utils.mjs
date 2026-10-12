import valueParser from "postcss-value-parser";

const namedColors = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
  crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
  darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
  dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
  gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);

const colorFunctions = new Set([
  "color",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "rgb",
  "rgba",
]);

const colorProperties = new Set([
  "accent-color",
  "background",
  "background-color",
  "background-image",
  "border-block",
  "border-block-color",
  "border-block-end",
  "border-block-end-color",
  "border-block-start",
  "border-block-start-color",
  "border-inline",
  "border-inline-color",
  "border-inline-end",
  "border-inline-end-color",
  "border-inline-start",
  "border-inline-start-color",
  "box-shadow",
  "caret-color",
  "column-rule",
  "column-rule-color",
  "color",
  "fill",
  "filter",
  "flood-color",
  "lighting-color",
  "outline",
  "outline-color",
  "scrollbar-color",
  "stop-color",
  "stroke",
  "text-decoration",
  "text-decoration-color",
  "text-emphasis",
  "text-emphasis-color",
  "text-shadow",
  "-webkit-text-fill-color",
  "-webkit-text-stroke",
  "-webkit-text-stroke-color",
]);

function isLiteralColor(value) {
  return (
    /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ||
    namedColors.has(value.toLowerCase())
  );
}

export function isColorProperty(property) {
  return (
    colorProperties.has(property) ||
    /^border(?:-(?:top|right|bottom|left))?(?:-color)?$/.test(property)
  );
}

export function findLiteralColors(value) {
  const colors = [];
  const visitNodes = (nodes) => {
    for (const node of nodes) {
      if (node.type === "function") {
        const name = node.value.toLowerCase();
        if (name === "url") continue;
        if (colorFunctions.has(name)) colors.push(valueParser.stringify(node));
        else if (node.nodes) visitNodes(node.nodes);
      } else if (node.type === "word" && isLiteralColor(node.value)) {
        colors.push(node.value);
      }
    }
  };

  visitNodes(valueParser(value).nodes);
  return colors;
}

export function findVariableReferences(value) {
  const variables = new Set();
  const visitNodes = (nodes) => {
    for (const node of nodes) {
      if (node.type !== "function" || !node.nodes) continue;
      if (node.value.toLowerCase() === "var") {
        const variable = node.nodes.find(
          (child) => child.type === "word" && child.value.startsWith("--"),
        );
        if (variable) variables.add(variable.value);
      }
      visitNodes(node.nodes);
    }
  };

  visitNodes(valueParser(value).nodes);
  return [...variables];
}

export function normalizeColor(color) {
  return color.toLowerCase().replace(/\s+/g, " ").trim();
}
