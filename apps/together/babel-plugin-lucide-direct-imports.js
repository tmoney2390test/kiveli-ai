const aliases = {
  AlertCircle: 'circle-alert',
  AlertTriangle: 'triangle-alert',
  AlignLeft: 'text-align-start',
  CheckCircle2: 'circle-check',
  CheckSquare: 'square-check-big',
  Clock3: 'clock-3',
  Edit3: 'pen-line',
  Globe2: 'earth',
  History: 'rotate-ccw-clock',
  Home: 'house',
  ImageIcon: 'image',
  Maximize2: 'maximize-2',
  Minimize2: 'minimize-2',
  MoreHorizontal: 'ellipsis',
  MoreVertical: 'ellipsis-vertical',
  Palmtree: 'tree-palm',
  Trash2: 'trash-2',
  Undo2: 'undo-2',
  Volume2: 'volume-2',
  Wand2: 'wand-sparkles',
};

function iconModule(name) {
  return aliases[name] ?? name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

module.exports = function lucideDirectImports({ types: t }) {
  return {
    name: 'kivelli-lucide-direct-imports',
    visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value !== 'lucide-react-native') return;
        const direct = [];
        const remaining = [];
        for (const specifier of path.node.specifiers) {
          if (!t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) {
            remaining.push(specifier);
            continue;
          }
          direct.push(t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier(specifier.local.name))],
            t.stringLiteral(`lucide-react-native/icons/${iconModule(specifier.imported.name)}`),
          ));
        }
        if (remaining.length) {
          direct.push(t.importDeclaration(remaining, t.stringLiteral('lucide-react-native')));
        }
        path.replaceWithMultiple(direct);
      },
    },
  };
};
