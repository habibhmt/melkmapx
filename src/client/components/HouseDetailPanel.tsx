import type { House } from '@/client/api';
import type { PostDetails } from '@/client/api/divar';
import { useMemo, useState } from 'react';
import { VscChromeClose } from 'react-icons/vsc'; // For a close button icon

interface HouseDetailPanelProps {
  house: House | null;
  details: PostDetails | null;
  onClose: () => void;
}

export function HouseDetailPanel({ house, details, onClose }: HouseDetailPanelProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Prepare house data with backwards compatibility
  const houseData = useMemo(() => {
    if (!house) return null;
    
    // Extract data from raw if available
    const raw = house.raw || house.rawData;
    
    return {
      ...house,
      size: house.size || house.area,
      totalPrice: house.totalPrice || (house.price * (house.size || house.area || 0)),
      roomCount: house.roomCount || house.rooms,
      imageUrl: house.imageUrl || house.imageUrls?.[0],
      subtitle: house.subtitle || house.subtitle1,
      chips: house.chips || [
        house.area && `${house.area} متر`,
        house.rooms && `${house.rooms} اتاق`,
        house.buildingAge && `${house.buildingAge} سال`,
      ].filter(Boolean) as string[],
      raw: raw,
      // Extract additional fields from raw data
      images: raw?.images || (house.imageUrl ? [house.imageUrl] : []),
      imageCount: raw?.image_count || raw?.images?.length || 0,
      longPreviewTitle: raw?.long_preview_title,
      shortPreviewTitle: raw?.short_preview_title,
      approximateLocation: raw?.approximate_location,
      chatEnabled: raw?.chat_enabled || house.chatEnabled,
      isVerified: raw?.is_verified || house.isVerified,
      locationType: raw?.location_type || house.locationType,
      isStockImage: raw?.is_stock_image,
      seen: raw?.seen,
      catType: raw?.cat_type,
      sortIndex: raw?.['sort-index'],
      prices: raw?.prices || []
    };
  }, [house]);

  // Data extraction logic
  const { imageUrls, title, description, price, size, extractedFeatures } = useMemo(() => {
    let images: string[] = houseData?.images || houseData?.imageUrls || [];
    let mainTitle: string | undefined = houseData?.title || (houseData?.token ? `Details for ${houseData.token}` : 'Property Details');
    let mainDescription: string | undefined = houseData?.description || 'Loading details or no additional details available.';
    let features = {
      hasElevator: houseData?.hasElevator,
      hasParking: houseData?.hasParking,
      hasStorage: houseData?.hasStorage
    };

    // If we have raw data with chips that have icons, extract features from them
    if (houseData?.raw?.chips) {
      const chipsWithIcons = houseData.raw.chips.filter((chip: any) => chip.icon_url_light || chip.icon_url_dark);
      chipsWithIcons.forEach((chip: any) => {
        if (chip.icon_url_light?.includes('elevator') || chip.icon_url_dark?.includes('elevator')) {
          features.hasElevator = false; // If icon exists, it means NO elevator (crossed out)
        }
        if (chip.icon_url_light?.includes('parking') || chip.icon_url_dark?.includes('parking')) {
          features.hasParking = false; // If icon exists, it means NO parking (crossed out)
        }
      });
    }

    if (details) {
      const imageSlider = details.sections
        ?.flatMap(s => s.widgets)
        .find(w => w?.widget_type === 'IMAGE_SLIDER_WIDGET_TYPE');
      
      if (imageSlider?.data?.items) {
        images = imageSlider.data.items.map((item: any) => item.image_url).filter(Boolean);
      } else {
        const singleImage = details.sections
          ?.flatMap(s => s.widgets)
          .find(w => w?.widget_type === 'IMAGE_VIEW_WIDGET_TYPE')
          ?.data?.image_url;
        if (singleImage) images = [singleImage];
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
    } else if (houseData && !details) {
      // If details haven't loaded yet but we have raw data, don't show "Loading details"
      mainDescription = '';
    }

    if (images.length === 0 && houseData?.imageUrl) {
      images = [houseData.imageUrl];
    }

    return {
      imageUrls: images,
      title: mainTitle,
      description: mainDescription,
      price: houseData?.pricePerMeter || houseData?.price,
      size: houseData?.size,
      extractedFeatures: features
    };
  }, [houseData, details]);

  if (!houseData) {
    return null;
  }

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="bg-base-200 shadow-xl absolute top-0 right-0 h-full w-96 p-4 overflow-y-auto z-[1000] transform transition-transform duration-300 ease-in-out"
         style={{ transform: houseData ? 'translateX(0)' : 'translateX(100%)' }} // Slide in/out
    >
      <button
        onClick={onClose}
        className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2 z-10"
        aria-label="Close panel"
      >
        <VscChromeClose className="size-5" />
      </button>

      {title && <h3 className="font-bold text-lg mb-4 mt-6 pr-8">{title}</h3>}

      {/* Image Gallery */}
      {imageUrls.length > 0 ? (
        <div className="relative mb-4">
          <img
            src={imageUrls[currentImageIndex]}
            alt={`${title || 'Property'} - Image ${currentImageIndex + 1}`}
            className="w-full h-auto object-cover rounded-md max-h-72"
            onError={(e) => {
              console.error('Failed to load image:', imageUrls[currentImageIndex]);
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23ccc"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
            }}
          />
          {imageUrls.length > 1 && (
            <>
              <button
                onClick={handlePrevImage}
                className="btn btn-circle btn-sm absolute left-2 top-1/2 -translate-y-1/2"
              >
                ‹
              </button>
              <button
                onClick={handleNextImage}
                className="btn btn-circle btn-sm absolute right-2 top-1/2 -translate-y-1/2"
              >
                ›
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 badge badge-neutral">
                {currentImageIndex + 1} / {imageUrls.length}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="w-full h-48 flex items-center justify-center bg-base-300 rounded-md mb-4">
            <p className="text-sm text-base-content-secondary">No image available</p>
        </div>
      )}

      {/* Price Information */}
      <div className="space-y-2 mb-4">
        {houseData?.prices && houseData.prices.length > 0 ? (
          houseData.prices.map((priceItem: any, index: number) => (
            <p key={index}>
              <span className="font-semibold">{priceItem.title}</span> {priceItem.value} {priceItem.unit}
            </p>
          ))
        ) : (
          <>
            <p><span className="font-semibold">Price per m²:</span> {price ? price.toLocaleString() + ' Toman' : 'N/A'}</p>
            {houseData?.totalPrice && (
              <p><span className="font-semibold">Total Price:</span> {houseData.totalPrice.toLocaleString()} Toman</p>
            )}
          </>
        )}
        <p><span className="font-semibold">Size:</span> {size ? size + ' m²' : 'N/A'}</p>
      </div>

      {/* Property Details */}
      <div className="space-y-2 mb-4">
        {houseData?.roomCount !== undefined && houseData?.roomCount > 0 && (
          <p><span className="font-semibold">Bedrooms:</span> {houseData.roomCount}</p>
        )}
        {houseData?.floor && (
          <p><span className="font-semibold">Floor:</span> {houseData.floor}</p>
        )}
        {houseData?.buildingAge && (
          <p><span className="font-semibold">Building Age:</span> {houseData.buildingAge} years</p>
        )}
        {houseData?.address && (
          <p><span className="font-semibold">Address:</span> {houseData.address}</p>
        )}
      </div>

      {/* Features Section */}
      <div className="mb-4">
        <h4 className="font-semibold text-md mb-2">Features:</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className={`badge ${extractedFeatures.hasElevator ? 'badge-success' : 'badge-ghost'}`}>
            {extractedFeatures.hasElevator ? '✓' : '✗'} Elevator
          </div>
          <div className={`badge ${extractedFeatures.hasParking ? 'badge-success' : 'badge-ghost'}`}>
            {extractedFeatures.hasParking ? '✓' : '✗'} Parking
          </div>
          <div className={`badge ${extractedFeatures.hasStorage ? 'badge-success' : 'badge-ghost'}`}>
            {extractedFeatures.hasStorage ? '✓' : '✗'} Storage
          </div>
        </div>
      </div>

      {/* Status Information */}
      <div className="mb-4 flex flex-wrap gap-2">
        {houseData?.isVerified && (
          <span className="badge badge-primary">✓ Verified</span>
        )}
        {houseData?.chatEnabled && (
          <span className="badge badge-info">💬 Chat Enabled</span>
        )}
        {houseData?.locationType && (
          <span className="badge badge-neutral text-xs">📍 Location Type: {houseData.locationType}</span>
        )}
        {houseData?.approximateLocation && (
          <span className="badge badge-warning text-xs">~ Approximate Location</span>
        )}
      </div>

      {/* Tags */}
      {houseData?.chips && houseData.chips.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-md mb-2">Tags:</h4>
          <div className="flex flex-wrap gap-2">
            {houseData.chips.map((chip: any, index: number) => {
              // If chip is object with title property
              if (typeof chip === 'object' && chip.title) {
                return <span key={index} className="badge badge-neutral text-xs">{chip.title}</span>;
              }
              // If chip is object with icon URLs but no title (like parking/elevator icons)
              if (typeof chip === 'object' && (chip.icon_url_light || chip.icon_url_dark)) {
                return (
                  <span key={index} className="badge badge-neutral text-xs">
                    {chip.icon_url_light?.includes('parking') ? '🅿️ Parking' : 
                     chip.icon_url_light?.includes('elevator') ? '🛗 Elevator' : 
                     'Feature'}
                  </span>
                );
              }
              // If chip is string
              if (typeof chip === 'string') {
                return <span key={index} className="badge badge-neutral text-xs">{chip}</span>;
              }
              // Skip invalid chips
              return null;
            })}
          </div>
        </div>
      )}

      {/* Subtitles */}
      {(houseData?.subtitle1 || houseData?.subtitle2 || houseData?.subtitle3) && (
        <div className="mb-4 space-y-1">
          {houseData.subtitle1 && <p className="text-sm">{houseData.subtitle1}</p>}
          {houseData.subtitle2 && <p className="text-sm text-base-content-secondary">{houseData.subtitle2}</p>}
          {houseData.subtitle3 && <p className="text-sm text-base-content-secondary">{houseData.subtitle3}</p>}
        </div>
      )}

      {description && (
        <div className="mb-4">
          <h4 className="font-semibold text-md mb-1">Description:</h4>
          <p className="text-sm whitespace-pre-wrap break-words">{description}</p>
        </div>
      )}

      {/* Additional Details */}
      {(houseData?.longPreviewTitle || houseData?.shortPreviewTitle) && (
        <div className="mb-4 space-y-1">
          <h4 className="font-semibold text-md mb-1">Preview Titles:</h4>
          {houseData.longPreviewTitle && <p className="text-sm">Long: {houseData.longPreviewTitle}</p>}
          {houseData.shortPreviewTitle && <p className="text-sm">Short: {houseData.shortPreviewTitle}</p>}
        </div>
      )}

      {/* Posted Date */}
      {houseData?.crawledAt && (
        <p className="text-xs text-base-content-secondary mb-4">
          Crawled: {new Date(houseData.crawledAt).toLocaleString('fa-IR')}
        </p>
      )}

      {/* Only show loading if we're actually fetching details */}
      {!details && houseData && houseData.token && (
        <div className="text-sm text-center p-4">
            <span className="loading loading-dots loading-md"></span>
            <p>Loading full details...</p>
        </div>
      )}

      {/* Debug section - show in both dev and prod for now to help debug */}
      {houseData?.raw && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold">▼ Raw Data (Debug)</summary>
          <pre className="text-xs overflow-auto max-h-40 mt-2 p-2 bg-base-300 rounded">
            {JSON.stringify(houseData.raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

