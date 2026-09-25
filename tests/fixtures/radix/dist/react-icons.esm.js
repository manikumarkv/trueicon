import { forwardRef, createElement } from 'react';

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  return target;
}

var _excluded = ["color"],
    _excluded$1 = ["color"];
var GitHubLogoIcon = /*#__PURE__*/forwardRef(function (_ref, forwardedRef) {
  var _ref$color = _ref.color,
      color = _ref$color === void 0 ? 'currentColor' : _ref$color,
      props = _objectWithoutPropertiesLoose(_ref, _excluded);

  return createElement("svg", Object.assign({
    width: "15",
    height: "15",
    viewBox: "0 0 15 15",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, props, {
    ref: forwardedRef
  }), createElement("path", {
    d: "M7.49933 0.25C3.49635 0.25 0.25 3.49593 0.25 7.50024Z",
    fill: color,
    fillRule: "evenodd",
    clipRule: "evenodd"
  }));
});

var TrashIcon = /*#__PURE__*/forwardRef(function (_ref, forwardedRef) {
  var _ref$color = _ref.color,
      color = _ref$color === void 0 ? 'currentColor' : _ref$color,
      props = _objectWithoutPropertiesLoose(_ref, _excluded$1);

  return createElement("svg", Object.assign({
    width: "15",
    height: "15",
    viewBox: "0 0 15 15",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, props, {
    ref: forwardedRef
  }), createElement("path", {
    d: "M5.5 1H9.5V2H5.5Z",
    fill: color
  }), createElement("rect", {
    x: "3",
    y: "3",
    width: "9",
    height: "1",
    rx: "0.5",
    fill: color
  }));
});

export { GitHubLogoIcon, TrashIcon };
//# sourceMappingURL=react-icons.esm.js.map
