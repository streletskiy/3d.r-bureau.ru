// Обработка прогресса загрузки
const onProgress = (event) => {
	const progressBar = event.target.querySelector('.progress-bar');
	const updatingBar = event.target.querySelector('.update-bar');
	updatingBar.style.width = `${event.detail.totalProgress * 100}%`;
	if (event.detail.totalProgress === 1) {
		progressBar.classList.add('hide');
		event.target.removeEventListener('progress', onProgress);
	} else {
		progressBar.classList.remove('hide');
	}
};

const modelViewerColor = document.querySelector('model-viewer');
modelViewerColor.addEventListener('progress', onProgress);

// Проверка, включён ли выбор цвета
const isColorPickerEnabled = modelViewerColor.dataset.colorPicker !== 'off';

fetch('../assets/cfg/cfg.json')
	.then(response => response.json())
	.then(config => {
		// Устанавливаем атрибуты model-viewer из config.modelViewerAttributes
		if (config.modelViewerAttributes) {
			for (const [key, value] of Object.entries(config.modelViewerAttributes)) {
				if (typeof value === 'boolean') {
					if (value) modelViewerColor.setAttribute(key, '');
				} else {
					modelViewerColor.setAttribute(key, value);
				}
			}
		}

		if (!isColorPickerEnabled) return;

		// Создаём кнопки выбора цвета
		const colorControls = document.getElementById('color-controls');
		const colors = config.colors || [];
		if (!colors.length || !colorControls) return;

		colors.forEach(({ color, label }) => {
			const button = document.createElement('button');
			button.setAttribute('data-color', color);
			button.setAttribute('alt', label);

			const mark = document.createElement('div');
			mark.className = 'mark';
			mark.style.backgroundColor = color;
			mark.setAttribute('data-color', color);

			button.appendChild(mark);
			colorControls.appendChild(button);
		});

		// Применение стиля выбранной кнопки
		const applySelectedStyle = (markElement) => {
			markElement.style.outline = `3px solid ${markElement.dataset.color}`;
			markElement.style.outlineOffset = '2px';
		};

		const clearSelection = () => {
			document.querySelectorAll('.mark').forEach(mark => {
				mark.style.outline = 'none';
			});
		};

		// Установка начального цвета из первой кнопки
		const firstMark = colorControls.querySelector('.mark');
		if (firstMark) {
			applySelectedStyle(firstMark);

			const initialColor = firstMark.dataset.color;
			modelViewerColor.addEventListener('load', () => {
				const [material] = modelViewerColor.model.materials;
				material.pbrMetallicRoughness.setBaseColorFactor(initialColor);
			});
		}

		// Обработка клика по цветам
		colorControls.addEventListener('click', (event) => {
			const colorString = event.target.dataset.color;
			if (!colorString) return;

			const [material] = modelViewerColor.model.materials;
			material.pbrMetallicRoughness.setBaseColorFactor(colorString);

			clearSelection();
			if (event.target.classList.contains('mark')) {
				applySelectedStyle(event.target);
			} else if (event.target.querySelector('.mark')) {
				applySelectedStyle(event.target.querySelector('.mark'));
			}
		});
	});
