import { supabase } from "@/integrations/supabase/client";
import type {
    Customer,
    CustomersBySalesmanGroup,
    CustomersWithoutSalesmanRow,
} from "../reports/types";

function toReadableError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
    ) {
        return String((error as { message: unknown }).message);
    }
    return "An unexpected error occurred. Please try again.";
}

export async function getCustomersBySalesman(): Promise<CustomersBySalesmanGroup[]> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            "id, code, name, name_ar, type, group_name, area, credit_days, credit_limit, is_active, salesman_id, salesmen!customers_salesman_id_fkey ( id, code, name, is_active )"
        )
        .not("salesman_id", "is", null)
        .eq("is_active", true)
        .order("name");

    if (error) {
        throw new Error(
            `Failed to load customers: ${toReadableError(error)}`
        );
    }

    const groupsMap = new Map<string, CustomersBySalesmanGroup>();

    (data as Customer[]).forEach((customer) => {
        const salesmanId = customer.salesman_id;
        const salesman = customer.salesmen;

        if (!salesmanId || !salesman) return;

        if (!groupsMap.has(salesmanId)) {
            groupsMap.set(salesmanId, { salesman, customers: [] });
        }

        groupsMap.get(salesmanId)!.customers.push(customer);
    });

    return Array.from(groupsMap.values()).sort((a, b) =>
        a.salesman.name.localeCompare(b.salesman.name)
    );
}

export async function getCustomersWithoutSalesman(): Promise<
    CustomersWithoutSalesmanRow[]
> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            "id, code, name, name_ar, type, group_name, area, credit_days, credit_limit, is_active, salesman_id"
        )
        .is("salesman_id", null)
        .eq("is_active", true)
        .order("name");

    if (error) {
        throw new Error(
            `Failed to load unassigned customers: ${toReadableError(error)}`
        );
    }

    return (data ?? []).map((customer) => ({
        customer: customer as Customer,
    }));
}
