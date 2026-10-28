import { apiFetch } from '../common/access';
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GenericForm from "../common/GenericForm";
import { ClipLoader } from "react-spinners";
import { requireOk, readJson } from '../common/requestResult';
import { BackToListing } from '../common/listNavigation';

function ReturnReceivingEdit() {
    const { id } = useParams();
    const [returnItem, setreturnItem] = useState(null);
    const [error, setError] = useState('');

    const initialData = {
        TrackingNumber: returnItem?.TrackingNumber || "",
        remark: returnItem?.Remark || "",
        OrderNumber: returnItem?.OrderNumber || "",
    };

    const fields = [
        {
            name: "TrackingNumber",
            label: "Tracking #",
            type: "text",
            placeholder: "e.g., RA428003440US",
            required: true,
        },
        {
            name: "OrderNumber",
            label: "Order #",
            type: "text",
            placeholder: "e.g., RA42800-A"
        },
        {
            name: "remark",
            label: "Remark",
            type: "textarea",
        }
    ];

    const handleSubmit = async (formData) => {
        const body = new FormData();
        body.append('OrderNumber', formData.OrderNumber);
        body.append('remark', formData.remark);
        body.append('user', formData.user);

        await requireOk(await apiFetch(
            `http://${window.location.hostname}:8088/return/edit/${id}`,
            {
                method: "POST",
                body,
            }
        ));
        return { success: true };
    };


    useEffect(() => {
        const fetchData = async () => {
            try {
                const [itemRes] = await Promise.all([
                    apiFetch(`http://${window.location.hostname}:8088/return/api/return/${id}`),
                ]);
                const itemData = await readJson(itemRes);
                setreturnItem(itemData);
            } catch (err) {
                setError(err.message);
            }
        };

        fetchData();
    }, [id]);

    if (error) return <div className="app-page"><p role="alert">{error}</p><BackToListing fallback="/return/legacy" /></div>;
    if (!returnItem) {
        return (
            <div className="flex justify-center items-center h-screen">
                <ClipLoader size={50} />
            </div>
        );
    }

    return (
        <GenericForm
            initialData={initialData}
            hideBackButton={true}
            fields={fields}
            onSubmit={handleSubmit}
            basePath="/return/legacy"
            itemId={id}
            isEdit={true}
            existingImages={{}}
        />
    );
}

export default ReturnReceivingEdit;
