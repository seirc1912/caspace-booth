import type { PhotoAsset } from '../types/selfBooth'

const imageBase = 'https://images.unsplash.com'

export const samplePhotos: PhotoAsset[] = [
  { id: 'booth-01', src: `${imageBase}/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85`, alt: 'Studio portrait smiling at camera', source: 'selfbooth' },
  { id: 'booth-02', src: `${imageBase}/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85`, alt: 'Studio portrait in natural light', source: 'selfbooth' },
  { id: 'booth-03', src: `${imageBase}/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85`, alt: 'Fashion portrait', source: 'selfbooth' },
  { id: 'booth-04', src: `${imageBase}/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=85`, alt: 'Portrait against a dark background', source: 'selfbooth' },
  { id: 'booth-05', src: `${imageBase}/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=900&q=85`, alt: 'Joyful studio portrait', source: 'selfbooth' },
  { id: 'booth-06', src: `${imageBase}/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=900&q=85`, alt: 'Close studio portrait', source: 'selfbooth' },
  { id: 'booth-07', src: `${imageBase}/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=85`, alt: 'Portrait with warm background', source: 'selfbooth' },
  { id: 'booth-08', src: `${imageBase}/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=900&q=85`, alt: 'Smiling studio portrait', source: 'selfbooth' },
]
