import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const usersToCreate = [
  { email: 'ceo@foodchoice.com', name: 'Mr. Mrawan', role: 'ceo', department: 'management' },
  { email: 'manager@foodchoice.com', name: 'Toufic', role: 'manager', department: 'operations' },
  { email: 'qc@foodchoice.com', name: 'Mohamed Othman', role: 'qc', department: 'warehouse' },
  { email: 'sales.manager@foodchoice.com', name: 'Abo Khaled', role: 'sales_manager', department: 'sales' },
  { email: 'jalil.sales@foodchoice.com', name: 'Jalil', role: 'salesman', department: 'sales' },
  { email: 'mohsen.sales@foodchoice.com', name: 'Mohsen', role: 'salesman', department: 'sales' },
  { email: 'noor.sales@foodchoice.com', name: 'Noor', role: 'salesman', department: 'sales' },
  { email: 'mohamed.sales@foodchoice.com', name: 'Mohamed', role: 'salesman', department: 'sales' },
  { email: 'barni.sales@foodchoice.com', name: 'Barni', role: 'salesman', department: 'sales' }
];

const password = 'Mm100100';

async function run() {
  console.log("Starting user creation...");
  const createdIds = [];

  for (const u of usersToCreate) {
    console.log(`\nProcessing: ${u.email}`);
    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email: u.email,
      password: password,
      options: {
        data: {
          full_name: u.name,
          role: u.role,
          department: u.department
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log(`User ${u.email} already exists.`);
        // Note: we can't get their ID if they already exist without logging in
      } else {
        console.error(`Failed to sign up ${u.email}:`, signUpError);
      }
    } else if (user) {
      console.log(`Created user ${u.email} with ID ${user.id}`);
      createdIds.push({ email: u.email, id: user.id, role: u.role });
    }
  }
  
  if (createdIds.length > 0) {
    console.log("\n=== SQL FOR ROLE UPDATES ===");
    console.log("Because of the `guard_profile_role_change` trigger, standard users cannot change their own roles.");
    console.log("Run the following SQL in the Supabase Dashboard SQL Editor to grant them the correct roles:\n");
    createdIds.forEach(u => {
      console.log(`UPDATE public.profiles SET role = '${u.role}' WHERE id = '${u.id}';`);
    });
  }
}

run();
