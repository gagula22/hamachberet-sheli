(function () {
  // Public Editable API, assembled from editable/utils.js + editable/image.js.
  window.Editable = {
    debounce: window.EditableUtils.debounce,
    insertImageFromFile: window.EditableImage.insertImageFromFile,
    insertImage: window.EditableImage.insertImage,
    attachImageBehaviors: window.EditableImage.attachImageBehaviors
  };
})();