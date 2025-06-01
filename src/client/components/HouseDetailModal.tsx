import type { House } from '@/client/api';
import type { PostDetails } from '@/client/api/divar'; // Assuming PostDetails is exported from divar.ts
import { useEffect, useMemo } from 'react';

interface HouseDetailModalProps {
  house: House | null;
  details: PostDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export function HouseDetailModal({ house, details, isOpen, onClose }: HouseDetailModalProps) {
  if (!isOpen || !house) {
    return null;
  }

  // Extracting image URL, title, and description from details.
  // This is a guess and might need adjustment based on actual API response structure.
  const { imageUrl, title, description, price, size } = useMemo(() => {
    let imgUrl: string | undefined;
    let mainTitle: string | undefined = 'Property Details';
    let mainDescription: string | undefined = 'No additional details available.';

    const firstImageData = details?.sections
      ?.flatMap(s => s.widgets)
      .find(w => w?.widget_type === 'IMAGE_SLIDER_WIDGET_TYPE' || w?.widget_type === 'IMAGE_VIEW_WIDGET_TYPE')
      ?.data?.items?.[0]?.image_url;
    if (firstImageData) {
      imgUrl = firstImageData;
    }

    const titleWidget = details?.sections
      ?.flatMap(s => s.widgets)
      .find(w => w?.widget_type === 'TITLE_ROW_WIDGET_TYPE');
    if (titleWidget?.data?.title) {
      mainTitle = titleWidget.data.title;
    }

    const descriptionWidget = details?.sections
        ?.flatMap(s => s.widgets)
        .find(w => w?.widget_type === 'DESCRIPTION_ROW_WIDGET_TYPE');
    if (descriptionWidget?.data?.text) {
        mainDescription = descriptionWidget.data.text;
    }


    return {
      imageUrl: imgUrl,
      title: mainTitle,
      description: mainDescription,
      price: house.price, // Assuming price per meter if available, or total price
      size: house.size,
    };
  }, [details, house]);

  // Use a dialog element for better accessibility
  useEffect(() => {
    const dialog = document.getElementById('house-detail-dialog') as HTMLDialogElement | null;
    if (dialog) {
      if (isOpen) {
        dialog.showModal();
      } else {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Handle closing the dialog via the Escape key or close button
  useEffect(() => {
    const dialog = document.getElementById('house-detail-dialog') as HTMLDialogElement | null;
    const closeDialog = () => {
      if (dialog?.open) {
        onClose();
      }
    };
    dialog?.addEventListener('close', closeDialog);
    return () => dialog?.removeEventListener('close', closeDialog);
  }, [onClose]);

  return (
    <dialog id="house-detail-dialog" className="modal">
      <div className="modal-box w-11/12 max-w-2xl">
        {title && <h3 className="font-bold text-lg mb-2">{title}</h3>}

        {imageUrl && (
          <img
            src={imageUrl}
            alt={title || 'Property image'}
            className="w-full h-auto object-cover rounded-md mb-4 max-h-96"
          />
        )}

        <div className="space-y-2 mb-4">
          <p><span className="font-semibold">Price:</span> {price ? price.toLocaleString() : 'N/A'} Toman</p>
          <p><span className="font-semibold">Size:</span> {size || 'N/A'} m²</p>
        </div>

        {description && (
          <div className="mb-4">
            <h4 className="font-semibold text-md mb-1">Description:</h4>
            <p className="text-sm whitespace-pre-wrap">{description}</p>
          </div>
        )}

        <div className="modal-action">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
      {/* Clicking outside the modal-box closes the dialog */}
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
