import type { House } from '@/client/api';
import type { PostDetails } from '@/client/api/divar';
import { useMemo } from 'react';
import { VscChromeClose } from 'react-icons/vsc'; // For a close button icon

interface HouseDetailPanelProps {
  house: House | null;
  details: PostDetails | null;
  onClose: () => void;
}

export function HouseDetailPanel({ house, details, onClose }: HouseDetailPanelProps) {
  // Data extraction logic - largely reused from the previous modal
  const { imageUrl, title, description, price, size } = useMemo(() => {
    let imgUrl: string | undefined;
    let mainTitle: string | undefined = house?.token ? `Details for ${house.token}` : 'Property Details';
    let mainDescription: string | undefined = 'Loading details or no additional details available.';

    if (details) { // Only try to extract from details if they exist
      const firstImageData = details.sections
        ?.flatMap(s => s.widgets)
        .find(w => w?.widget_type === 'IMAGE_SLIDER_WIDGET_TYPE' || w?.widget_type === 'IMAGE_VIEW_WIDGET_TYPE')
        ?.data?.items?.[0]?.image_url;
      if (firstImageData) {
        imgUrl = firstImageData;
      }

      const titleWidget = details.sections
        ?.flatMap(s => s.widgets)
        .find(w => w?.widget_type === 'TITLE_ROW_WIDGET_TYPE');
      if (titleWidget?.data?.title) {
        mainTitle = titleWidget.data.title;
      }

      const descriptionWidget = details.sections
          ?.flatMap(s => s.widgets)
          .find(w => w?.widget_type === 'DESCRIPTION_ROW_WIDGET_TYPE');
      if (descriptionWidget?.data?.text) {
          mainDescription = descriptionWidget.data.text;
      }
    } else if (house) {
        // Basic info if details are still loading
        mainTitle = `Property ${house.token}`;
        mainDescription = 'Fetching more details...';
    }


    return {
      imageUrl: imgUrl,
      title: mainTitle,
      description: mainDescription,
      price: house?.price,
      size: house?.size,
    };
  }, [house, details]);

  if (!house) { // If no house is selected, panel should not be rendered (this check might be redundant if Root controls rendering)
    return null;
  }

  return (
    <div className="bg-base-200 shadow-xl fixed top-0 right-0 h-full w-96 p-4 overflow-y-auto z-20 transform transition-transform duration-300 ease-in-out"
         style={{ transform: house ? 'translateX(0)' : 'translateX(100%)' }} // Slide in/out
    >
      <button
        onClick={onClose}
        className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
        aria-label="Close panel"
      >
        <VscChromeClose className="size-5" />
      </button>

      {title && <h3 className="font-bold text-lg mb-4 mt-6">{title}</h3>}

      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title || 'Property image'}
          className="w-full h-auto object-cover rounded-md mb-4 max-h-72"
        />
      ) : details && !imageUrl ? (
        <div className="w-full h-48 flex items-center justify-center bg-base-300 rounded-md mb-4">
            <p className="text-sm text-base-content-secondary">No image available</p>
        </div>
      ) : (
        <div className="w-full h-48 bg-base-300 rounded-md mb-4 animate-pulse"></div> // Loading placeholder for image
      )}

      <div className="space-y-2 mb-4">
        <p><span className="font-semibold">Price:</span> {price ? price.toLocaleString() + ' Toman' : (house ? 'Loading...' : 'N/A')}</p>
        <p><span className="font-semibold">Size:</span> {size ? size + ' m²' : (house ? 'Loading...' : 'N/A')}</p>
      </div>

      {description && (
        <div className="mb-4">
          <h4 className="font-semibold text-md mb-1">Description:</h4>
          <p className="text-sm whitespace-pre-wrap break-words">{description}</p>
        </div>
      )}
      {!details && house && (
        <div className="text-sm text-center p-4">
            <span className="loading loading-dots loading-md"></span>
            <p>Loading full details...</p>
        </div>
      )}
    </div>
  );
}
