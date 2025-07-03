import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GenericForm from "../common/GenericForm";
import { ClipLoader } from "react-spinners";

function ReturnReceivingEdit() {
    const { id } = useParams();
    const [returnItem, setreturnItem] = useState(null);

    const initialData = {
        TrackingNumber: returnItem?.TrackingNumber || "",
        Remark: returnItem?.Remark || "",
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

    const handleSubmit = (formData) => {
        const body = new FormData();
        body.append('OrderNumber', formData.OrderNumber);
        body.append('remark', formData.remark);
        body.append('user', formData.user);

        fetch(
            `http://${window.location.hostname}:8088/return/edit/${id}`,
            {
                method: "POST",
                body,
            }
        )
            .then((res) => res.json())
            .then((data) => {
                console.log(data);
                alert("Edit successful!");
            })
            .catch((err) => {
                console.error(err);
                alert("Edit failed!");
            });
    };


    useEffect(() => {
        const fetchData = async () => {
            try {
                const [itemRes] = await Promise.all([
                    fetch(`http://${window.location.hostname}:8088/return/api/return/${id}`),
                ]);
                const itemData = await itemRes.json();
                setreturnItem(itemData);
            } catch (err) {
                console.error(err);
            }
        };

        fetchData();
    }, [id]);

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
            onDelete={() => { }}
            basePath="/return"
            itemId={id}
            isEdit={true}
            existingImages={{}}
        />
    );
}

export default ReturnReceivingEdit;
