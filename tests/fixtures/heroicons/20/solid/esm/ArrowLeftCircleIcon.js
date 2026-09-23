import * as React from "react";
function ArrowLeftCircleIcon({
  title,
  titleId,
  ...props
}, svgRef) {
  return /*#__PURE__*/React.createElement("svg", Object.assign({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 20 20",
    fill: "currentColor",
    "aria-hidden": "true",
    "data-slot": "icon",
    ref: svgRef,
    "aria-labelledby": titleId
  }, props), title ? /*#__PURE__*/React.createElement("title", {
    id: titleId
  }, title) : null, /*#__PURE__*/React.createElement("g", {
    clipPath: "url(#a)"
  }, /*#__PURE__*/React.createElement("path", {
    fillRule: "evenodd",
    d: "M10 18a8 8 0 1 0 0-16"
  })), /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("clipPath", {
    id: "a"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M0 0h20v20H0z"
  }))));
}
const ForwardRef = React.forwardRef(ArrowLeftCircleIcon);
export default ForwardRef;
