const onProgress = (event) => {
  const progressBar = event.target.querySelector(".progress-bar");
  const updatingBar = event.target.querySelector(".update-bar");
  if (!progressBar || !updatingBar) return;

  updatingBar.style.width = `${event.detail.totalProgress * 100}%`;
  if (event.detail.totalProgress === 1) {
    progressBar.classList.add("hide");
    event.target.removeEventListener("progress", onProgress);
  } else {
    progressBar.classList.remove("hide");
  }
};

const modelViewer = document.querySelector("model-viewer");
if (!modelViewer) {
  throw new Error("model-viewer element not found on the page.");
}

modelViewer.addEventListener("progress", onProgress);

const isColorPickerEnabled = modelViewer.dataset.colorPicker !== "off";
const selectorBlocks = Array.from(
  document.querySelectorAll(".controls[data-selector]"),
);
const textureCache = new Map();
const pendingInitializers = [];
let selectorLabels = {};

const resolveGroupLabel = (group, type) => {
  if (!group) return "";
  const current = group.getAttribute("data-label");
  const normalized = (current || "").trim();
  if (normalized) return normalized;
  const fallback = selectorLabels?.[type];
  if (fallback) {
    group.setAttribute("data-label", fallback);
    return fallback;
  }
  return "";
};

const ensureGroupLabelElement = (group, labelText) => {
  if (!group) return;

  let labelElement = group.querySelector(".selector-label");
  if (!labelText) {
    if (labelElement) labelElement.remove();
    return;
  }

  if (!labelElement) {
    labelElement = document.createElement("div");
    labelElement.className = "selector-label";
    group.prepend(labelElement);
  } else if (labelElement !== group.firstElementChild) {
    group.insertBefore(labelElement, group.firstChild);
  }

  labelElement.textContent = labelText;
};

const waitForModelLoad = () => {
  if (modelViewer.model) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    modelViewer.addEventListener("load", resolve, { once: true });
  });
};

const readMaterialIndex = (element) => {
  const raw =
    element.dataset.materialIndex ?? modelViewer.dataset.materialIndex ?? "0";
  const index = parseInt(raw, 10);
  return Number.isNaN(index) ? 0 : index;
};

const getMaterial = async (index) => {
  await waitForModelLoad();
  const materials = modelViewer.model?.materials;
  if (!materials || !materials[index]) {
    console.warn(`Material at index ${index} is not available.`);
    return null;
  }
  return materials[index];
};

const clearBaseColorTexture = (material) => {
  const pbr = material?.pbrMetallicRoughness;
  if (!pbr) return;

  if (typeof pbr.setBaseColorTexture === "function") {
    pbr.setBaseColorTexture(null);
    return;
  }

  const textureInfo = pbr.baseColorTexture;
  if (!textureInfo) return;

  if (typeof textureInfo.setTexture === "function") {
    textureInfo.setTexture(null);
  } else {
    textureInfo.texture = null;
  }
};

const applyColor = async (materialIndex, colorValue) => {
  const material = await getMaterial(materialIndex);
  if (!material) return;

  clearBaseColorTexture(material);
  material.pbrMetallicRoughness.setBaseColorFactor(colorValue);
};

const loadTexture = async (source) => {
  if (!source) return null;
  if (!textureCache.has(source)) {
    const texturePromise = waitForModelLoad()
      .then(() => modelViewer.createTexture(source))
      .catch((error) => {
        console.error(`Failed to load texture "${source}"`, error);
        return null;
      });
    textureCache.set(source, texturePromise);
  }

  return textureCache.get(source);
};

const applyTexture = async (materialIndex, textureSource) => {
  const material = await getMaterial(materialIndex);
  if (!material) return;

  const pbr = material.pbrMetallicRoughness;
  if (!pbr) {
    console.warn(
      "Material does not expose pbrMetallicRoughness, cannot assign texture.",
    );
    return;
  }

  const texture = await loadTexture(textureSource);
  if (!texture) return;

  let textureInfo = pbr.baseColorTexture;

  if (!textureInfo && typeof pbr.createTexture === "function") {
    textureInfo = pbr.createTexture("baseColorTexture");
  }

  if (!textureInfo && typeof material.createTexture === "function") {
    textureInfo = material.createTexture("baseColorTexture");
  }

  if (!textureInfo) {
    console.warn(
      "Unable to assign base color texture because no texture info is available.",
    );
    return;
  }

  if (typeof textureInfo.setTexture === "function") {
    textureInfo.setTexture(texture);
  } else {
    textureInfo.texture = texture;
  }

  if (typeof pbr.setBaseColorTexture === "function") {
    pbr.setBaseColorTexture(texture);
  }

  const updatedTextureInfo = pbr.baseColorTexture;
  if (
    updatedTextureInfo &&
    "texCoord" in updatedTextureInfo &&
    (updatedTextureInfo.texCoord === undefined ||
      updatedTextureInfo.texCoord === null)
  ) {
    updatedTextureInfo.texCoord = 0;
  }

  if (typeof pbr.setBaseColorFactor === "function") {
    pbr.setBaseColorFactor([1, 1, 1, 1]);
  }
};

const highlightSelection = (block, button) => {
  const highlightColor = button.dataset.highlightColor || "#4285f4";

  block.querySelectorAll(".mark").forEach((mark) => {
    mark.classList.remove("selected");
    mark.style.removeProperty("--mark-outline-color");
    mark.style.removeProperty("outline");
    mark.style.removeProperty("outline-offset");
  });

  const mark = button.querySelector(".mark");
  if (mark) {
    mark.classList.add("selected");
    mark.style.setProperty("--mark-outline-color", highlightColor);
  }
};

const resolveOptions = (config, block, fallbackKey) => {
  const path = block.dataset.options || fallbackKey;
  if (!path) return [];

  const segments = path.split(".");
  let current = config;
  for (const segment of segments) {
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      current = undefined;
      break;
    }
  }

  return Array.isArray(current) ? current : [];
};

const buildColorSelector = (config, block) => {
  if (!isColorPickerEnabled) return;

  const options = resolveOptions(config, block, "colors");
  if (!options.length) return;

  const group = block.closest(".selector-group");
  const labelText = resolveGroupLabel(group, "color");
  ensureGroupLabelElement(group, labelText);

  const materialIndex = readMaterialIndex(block);
  block.innerHTML = "";

  options.forEach(({ color, label }) => {
    if (!color) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = color;
    button.dataset.highlightColor = color;
    if (label) button.title = label;

    const mark = document.createElement("div");
    mark.className = "mark";
    mark.style.backgroundColor = color;
    mark.dataset.color = color;

    button.appendChild(mark);
    block.appendChild(button);
  });

  const buttons = Array.from(block.querySelectorAll("button[data-value]"));
  if (!buttons.length) return;

  const defaultValue = block.dataset.defaultValue || buttons[0].dataset.value;
  const defaultButton =
    buttons.find((btn) => btn.dataset.value === defaultValue) || buttons[0];

  highlightSelection(block, defaultButton);
  pendingInitializers.push(() =>
    applyColor(materialIndex, defaultButton.dataset.value),
  );

  block.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button || !block.contains(button)) return;

    highlightSelection(block, button);
    applyColor(materialIndex, button.dataset.value);
  });
};

const buildTextureSelector = (config, block) => {
  const options = resolveOptions(config, block, "textures");
  if (!options.length) return;

  const group = block.closest(".selector-group");
  const labelText = resolveGroupLabel(group, "texture");
  ensureGroupLabelElement(group, labelText);

  const materialIndex = readMaterialIndex(block);
  const basePath = block.dataset.basePath || "../assets/textures/";
  block.innerHTML = "";

  const resolveTextureSource = (entry) => {
    if (entry.src) return entry.src;
    if (entry.file) {
      return basePath.endsWith("/")
        ? `${basePath}${entry.file}`
        : `${basePath}/${entry.file}`;
    }
    return null;
  };

  options.forEach((option) => {
    const source = resolveTextureSource(option);
    if (!source) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = source;
    button.dataset.highlightColor =
      option.highlight || option.tint || "#4285f4";
    if (option.label) button.title = option.label;

    const mark = document.createElement("div");
    mark.className = "mark";
    mark.style.backgroundImage = `url("${source}")`;
    mark.style.backgroundSize = "cover";
    mark.style.backgroundPosition = "center";

    if (option.tint) {
      mark.style.backgroundColor = option.tint;
    }

    button.appendChild(mark);
    block.appendChild(button);
  });

  const buttons = Array.from(block.querySelectorAll("button[data-value]"));
  if (!buttons.length) return;

  const defaultValue = block.dataset.defaultValue || buttons[0].dataset.value;
  const defaultButton =
    buttons.find((btn) => btn.dataset.value === defaultValue) || buttons[0];

  highlightSelection(block, defaultButton);
  pendingInitializers.push(() =>
    applyTexture(materialIndex, defaultButton.dataset.value),
  );

  block.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button || !block.contains(button)) return;

    highlightSelection(block, button);
    applyTexture(materialIndex, button.dataset.value);
  });
};

const initializeSelectors = (config) => {
  if (selectorBlocks.length) {
    selectorBlocks.forEach((block) => {
      const type = (block.dataset.selector || "").toLowerCase();
      if (type === "color") {
        buildColorSelector(config, block);
      } else if (type === "texture") {
        buildTextureSelector(config, block);
      }
    });
  } else if (isColorPickerEnabled) {
    const fallbackControls = document.getElementById("color-controls");
    if (fallbackControls) {
      fallbackControls.dataset.selector = "color";
      buildColorSelector(config, fallbackControls);
    }
  }
};

const runInitializers = () => {
  if (!pendingInitializers.length) return;
  const tasks = pendingInitializers.splice(0, pendingInitializers.length);
  tasks.forEach((task) => task());
};

fetch("../assets/cfg/cfg.json")
  .then((response) => response.json())
  .then((config) => {
    selectorLabels = config.selectorLabels || {};

    if (config.modelViewerAttributes) {
      for (const [key, value] of Object.entries(config.modelViewerAttributes)) {
        if (typeof value === "boolean") {
          if (value) modelViewer.setAttribute(key, "");
        } else {
          modelViewer.setAttribute(key, value);
        }
      }
    }

    initializeSelectors(config);

    if (modelViewer.model) {
      runInitializers();
    } else {
      modelViewer.addEventListener("load", runInitializers, { once: true });
    }
  })
  .catch((error) => {
    console.error("Failed to load configuration for model-viewer:", error);
  });
