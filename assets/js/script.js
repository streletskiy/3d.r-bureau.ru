const onProgress = (event) => {
	const progressBar = event.target.querySelector('.progress-bar');
	const updatingBar = event.target.querySelector('.update-bar');
	if (!progressBar || !updatingBar) return;

	updatingBar.style.width = `${event.detail.totalProgress * 100}%`;
	if (event.detail.totalProgress === 1) {
		progressBar.classList.add('hide');
		event.target.removeEventListener('progress', onProgress);
	} else {
		progressBar.classList.remove('hide');
	}
};

const modelViewer = document.querySelector('model-viewer');
if (!modelViewer) {
	throw new Error('model-viewer element not found on the page.');
}

modelViewer.addEventListener('progress', onProgress);

const isColorPickerEnabled = modelViewer.dataset.colorPicker !== 'off';
const selectorBlocks = Array.from(document.querySelectorAll('.controls[data-selector]'));
const textureCache = new Map();
const pendingInitializers = [];

const waitForModelLoad = () => {
	if (modelViewer.model) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		modelViewer.addEventListener('load', resolve, { once: true });
	});
};

const readMaterialIndex = (element) => {
	const raw = element.dataset.materialIndex ?? modelViewer.dataset.materialIndex ?? '0';
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

const clearBaseColorTexture = async (material) => {
	if (!material) return;

	if (typeof material.setTexture === 'function') {
		await material.setTexture('baseColorTexture', null);
		return;
	}

	const textureInfo = material.pbrMetallicRoughness?.baseColorTexture;
	if (textureInfo && typeof textureInfo.setTexture === 'function') {
		textureInfo.setTexture(null);
	}
};

const applyColor = async (materialIndex, colorValue) => {
	const material = await getMaterial(materialIndex);
	if (!material) return;

	await clearBaseColorTexture(material);
	material.pbrMetallicRoughness.setBaseColorFactor(colorValue);
};

const loadTexture = async (source) => {
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

	const texture = await loadTexture(textureSource);
	if (!texture) return;

	if (typeof material.setTexture === 'function') {
		await material.setTexture('baseColorTexture', texture);
	} else if (material.pbrMetallicRoughness?.baseColorTexture?.setTexture) {
		material.pbrMetallicRoughness.baseColorTexture.setTexture(texture);
	} else {
		console.warn('Unable to assign base color texture because the API surface is unavailable.');
		return;
	}

	material.pbrMetallicRoughness.setBaseColorFactor([1, 1, 1, 1]);
};

const highlightSelection = (block, button) => {
	const highlightColor = button.dataset.highlightColor || '#ffffff';

	block.querySelectorAll('.mark').forEach((mark) => {
		mark.classList.remove('selected');
		mark.style.outline = 'none';
	});

	const mark = button.querySelector('.mark');
	if (mark) {
		mark.classList.add('selected');
		mark.style.outline = `3px solid ${highlightColor}`;
		mark.style.outlineOffset = '2px';
	}
};

const resolveOptions = (config, block, fallbackKey) => {
	const path = block.dataset.options || fallbackKey;
	if (!path) return [];

	const segments = path.split('.');
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

	const options = resolveOptions(config, block, 'colors');
	if (!options.length) return;

	const materialIndex = readMaterialIndex(block);
	block.innerHTML = '';

	options.forEach(({ color, label }) => {
		if (!color) return;

		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.value = color;
		button.dataset.highlightColor = color;
		if (label) button.title = label;

		const mark = document.createElement('div');
		mark.className = 'mark';
		mark.style.backgroundColor = color;
		mark.dataset.color = color;

		button.appendChild(mark);
		block.appendChild(button);
	});

	const buttons = Array.from(block.querySelectorAll('button[data-value]'));
	if (!buttons.length) return;

	const defaultValue = block.dataset.defaultValue || buttons[0].dataset.value;
	const defaultButton = buttons.find((btn) => btn.dataset.value === defaultValue) || buttons[0];

	highlightSelection(block, defaultButton);
	pendingInitializers.push(() => applyColor(materialIndex, defaultButton.dataset.value));

	block.addEventListener('click', (event) => {
		const button = event.target.closest('button[data-value]');
		if (!button || !block.contains(button)) return;

		highlightSelection(block, button);
		applyColor(materialIndex, button.dataset.value);
	});
};

const buildTextureSelector = (config, block) => {
	const options = resolveOptions(config, block, 'textures');
	if (!options.length) return;

	const materialIndex = readMaterialIndex(block);
	const basePath = block.dataset.basePath || '../assets/textures/';
	block.innerHTML = '';

	const resolveTextureSource = (entry) => {
		if (entry.src) return entry.src;
		if (entry.file) {
			return basePath.endsWith('/') ? `${basePath}${entry.file}` : `${basePath}/${entry.file}`;
		}
		return null;
	};

	options.forEach((option) => {
		const source = resolveTextureSource(option);
		if (!source) return;

		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.value = source;
		button.dataset.highlightColor = option.highlight || option.tint || '#ffffff';
		if (option.label) button.title = option.label;

		const mark = document.createElement('div');
		mark.className = 'mark';
		mark.style.backgroundImage = `url("${source}")`;
		mark.style.backgroundSize = 'cover';
		mark.style.backgroundPosition = 'center';

		if (option.tint) {
			mark.style.backgroundColor = option.tint;
		}

		button.appendChild(mark);
		block.appendChild(button);
	});

	const buttons = Array.from(block.querySelectorAll('button[data-value]'));
	if (!buttons.length) return;

	const defaultValue = block.dataset.defaultValue || buttons[0].dataset.value;
	const defaultButton = buttons.find((btn) => btn.dataset.value === defaultValue) || buttons[0];

	highlightSelection(block, defaultButton);
	pendingInitializers.push(() => applyTexture(materialIndex, defaultButton.dataset.value));

	block.addEventListener('click', (event) => {
		const button = event.target.closest('button[data-value]');
		if (!button || !block.contains(button)) return;

		highlightSelection(block, button);
		applyTexture(materialIndex, button.dataset.value);
	});
};

const initializeSelectors = (config) => {
	if (selectorBlocks.length) {
		selectorBlocks.forEach((block) => {
			const type = (block.dataset.selector || '').toLowerCase();
			if (type === 'color') {
				buildColorSelector(config, block);
			} else if (type === 'texture') {
				buildTextureSelector(config, block);
			}
		});
	} else if (isColorPickerEnabled) {
		const fallbackControls = document.getElementById('color-controls');
		if (fallbackControls) {
			fallbackControls.dataset.selector = 'color';
			buildColorSelector(config, fallbackControls);
		}
	}
};

const runInitializers = () => {
	if (!pendingInitializers.length) return;
	const tasks = pendingInitializers.splice(0, pendingInitializers.length);
	tasks.forEach((task) => task());
};

fetch('../assets/cfg/cfg.json')
	.then((response) => response.json())
	.then((config) => {
		if (config.modelViewerAttributes) {
			for (const [key, value] of Object.entries(config.modelViewerAttributes)) {
				if (typeof value === 'boolean') {
					if (value) modelViewer.setAttribute(key, '');
				} else {
					modelViewer.setAttribute(key, value);
				}
			}
		}

		initializeSelectors(config);

		if (modelViewer.model) {
			runInitializers();
		} else {
			modelViewer.addEventListener('load', runInitializers, { once: true });
		}
	})
	.catch((error) => {
		console.error('Failed to load configuration for model-viewer:', error);
	});
