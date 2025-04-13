// Обработка прогресса — оставить как есть
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
document.querySelector('model-viewer').addEventListener('progress', onProgress);

// Обработка цвета модели
const modelViewerColor = document.querySelector('model-viewer');
const colorControls = document.querySelector('#color-controls');

// Устанавливает цвет текста равным цвету фона, чтобы currentColor работал для outline
function applySelectedStyle(markElement) {
	const color = markElement.dataset.color;
	markElement.style.color = color;
	markElement.classList.add('selected');
}

// Удаляет выделение со всех кнопок
function clearSelection() {
	colorControls.querySelectorAll('.mark').forEach(mark => {
		mark.classList.remove('selected');
		mark.style.color = '';
	});
}

// Выделить первую кнопку по умолчанию и установить цвет модели
const firstMark = colorControls.querySelector('.mark');
applySelectedStyle(firstMark);

// Назначить стартовый цвет модели из первой кнопки
const initialColor = firstMark.dataset.color;
modelViewerColor.addEventListener('load', () => {
	const [material] = modelViewerColor.model.materials;
	material.pbrMetallicRoughness.setBaseColorFactor(initialColor);
});

// Обработчик кликов по цветам
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

