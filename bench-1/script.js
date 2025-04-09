// Handles loading the events for <model-viewer>'s slotted progress bar
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

const modelViewerColor = document.querySelector('model-viewer');

document.querySelector('#color-controls').addEventListener('click', (event) => {
	const colorString = event.target.dataset.color;
	const [material] = modelViewerColor.model.materials;
	material.pbrMetallicRoughness.setBaseColorFactor(colorString);
});