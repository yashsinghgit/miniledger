import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";

const API_BASE_URL = 'http://10.165.103.246:4000';

type Loan = {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string;
  repaidAt: string | null;
};

export default function App() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState({
    totalLent: 0,
    totalRepaid: 0,
    overdueAmount: 0,
  });

  const totalLent = loans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalRepaid = loans
    .filter((loan) => loan.repaidAt)
    .reduce((sum, loan) => sum + loan.amount, 0);

  const overdueAmount = loans
    .filter((loan) => !loan.repaidAt && new Date(loan.dueDate) < new Date())
    .reduce((sum, loan) => sum + loan.amount, 0);

  const requestOtp = async () => {
    if (!/^\+?[1-9]\d{9,14}$/.test(phone)) {
      Alert.alert(
        "Invalid phone number",
        "Enter a valid phone number and try again.",
      );
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not request OTP");
      }

      setOtp("");
      setShowOtp(true);
      Alert.alert(
        "OTP requested",
        "Check the backend terminal for the latest demo OTP.",
      );
    } catch (error) {
      Alert.alert(
        "Could not send OTP",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert("Invalid OTP", "Enter the 6-digit OTP and try again.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setOtp("");
        throw new Error(
          data.error || "Incorrect or expired OTP. Please try again.",
        );
      }

      setToken(data.token);
      setLoggedIn(true);
    } catch (error) {
      Alert.alert(
        "Verification failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const addLoan = async () => {
    const numericAmount = Number(amount);

    if (
      !friendName.trim() ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !dueDate
    ) {
      Alert.alert(
        "Missing details",
        "Enter a friend, valid amount, and due date.",
      );
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      Number.isNaN(Date.parse(`${dueDate}T00:00:00`))
    ) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/loans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          friendName: friendName.trim(),
          amount: numericAmount,
          dueDate,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add loan");

      setFriendName("");
      setAmount("");
      setDueDate("");
      await refreshData();
    } catch (error) {
      Alert.alert("Could not add loan", String(error));
    }
  };

  const markRepaid = async (id: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/loans/${encodeURIComponent(id)}/repay`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not mark as repaid");

      await refreshData();
    } catch (error) {
      Alert.alert("Repayment failed", String(error));
    }
  };

  const pickAndUploadReceipt = async (loanId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });

      if (result.canceled) return;

      const image = result.assets[0];
      const formData = new FormData();

      formData.append("receipt", {
        uri: image.uri,
        name: image.fileName || `receipt-${Date.now()}.jpg`,
        type: image.mimeType || "image/jpeg",
      } as any);

      const response = await fetch(
        `${API_BASE_URL}/loans/${encodeURIComponent(loanId)}/receipt`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Receipt upload failed");
      }

      Alert.alert("Success", "Receipt uploaded successfully!");
      await refreshData();
    } catch (error) {
      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload receipt",
      );
    }
  };

  const loadLoans = async () => {
    const response = await fetch(`${API_BASE_URL}/loans`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load loans");

    setLoans(data);
  };

  const loadSummary = async () => {
    const response = await fetch(`${API_BASE_URL}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load summary");
    }

    setSummary(data);
  };

  const refreshData = async () => {
    try {
      await Promise.all([loadLoans(), loadSummary()]);
    } catch (error) {
      Alert.alert("Refresh failed", String(error));
    }
  };

  useEffect(() => {
    if (loggedIn && token) {
      refreshData();
    }
  }, [loggedIn, token]);

  if (!loggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.login}>
          <Text style={styles.logo}>MiniLedger</Text>
          <Text style={styles.subtitle}>Your money, clearly tracked.</Text>
          <Text style={styles.label}>PHONE NUMBER</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 9876543210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          {showOtp && (
            <>
              <>
                <Text style={styles.label}>6-DIGIT OTP</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                />
              </>
              <TouchableOpacity
                onPress={() => {
                  setOtp("");
                  setShowOtp(false);
                }}
                style={{ alignSelf: "flex-start", marginBottom: 12 }}
              >
                <Text style={{ color: "#1C5744", fontWeight: "600" }}>
                  Change phone number
                </Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={showOtp ? verifyOtp : requestOtp}
          >
            <Text style={styles.primaryButtonText}>
              {showOtp ? "Verify OTP" : "Send OTP"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.footnote}>Simple, private loan tracking.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>MiniLedger</Text>
        <Text style={styles.subtitle}>Your personal lending dashboard</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.cardCaption}>TOTAL LENT</Text>
          <Text style={styles.total}>₹{summary.totalLent.toFixed(2)}</Text>
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statLabel}>Repaid</Text>
              <Text style={styles.statValue}>
                ₹{summary.totalRepaid.toFixed(2)}
              </Text>
            </View>
            <View>
              <Text style={styles.statLabel}>Overdue</Text>
              <Text style={[styles.statValue, styles.danger]}>
                ₹{summary.overdueAmount.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Add a loan</Text>
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            placeholder="Friend's name"
            value={friendName}
            onChangeText={setFriendName}
          />
          <TextInput
            style={styles.input}
            placeholder="Amount in ₹"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Due date (YYYY-MM-DD)"
            value={dueDate}
            onChangeText={setDueDate}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={addLoan}>
            <Text style={styles.primaryButtonText}>Add loan</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Loan history</Text>
        {loans.length === 0 ? (
          <Text style={styles.empty}>
            No loans yet. Add your first entry above.
          </Text>
        ) : (
          loans.map((loan) => {
            const overdue =
              !loan.repaidAt && new Date(loan.dueDate) < new Date();
            return (
              <View
                key={loan.id}
                style={[styles.loanCard, overdue && styles.overdueCard]}
              >
                <View style={styles.loanHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.friend}>{loan.friendName}</Text>
                    <Text style={styles.loanDate}>
                      Due {new Date(loan.dueDate).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.loanAmount}>
                    ₹{loan.amount.toFixed(2)}
                  </Text>
                </View>
                <Text style={[styles.status, overdue && styles.danger]}>
                  {loan.repaidAt ? "REPAID" : overdue ? "OVERDUE" : "PENDING"}
                </Text>
                {!loan.repaidAt && (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => markRepaid(loan.id)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      Mark as repaid
                    </Text>
                  </TouchableOpacity>
                )}
                 <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => pickAndUploadReceipt(loan.id)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        Upload Receipt
                      </Text>
                    </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7F4" },
  login: { flex: 1, justifyContent: "center", padding: 24 },
  content: { padding: 22, paddingBottom: 40 },
  logo: { fontSize: 30, fontWeight: "800", color: "#173D32" },
  subtitle: { fontSize: 14, color: "#66756D", marginTop: 5, marginBottom: 26 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#52665B",
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE5DE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 12,
    color: "#173D32",
  },
  primaryButton: {
    backgroundColor: "#1C5744",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  footnote: {
    textAlign: "center",
    marginTop: 24,
    color: "#78857D",
    fontSize: 12,
  },
  summaryCard: {
    backgroundColor: "#173D32",
    borderRadius: 20,
    padding: 22,
    marginBottom: 28,
  },
  cardCaption: {
    color: "#C4D8CC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  total: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginTop: 8 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  statLabel: { color: "#C4D8CC", fontSize: 12 },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 5,
  },
  danger: { color: "#C84C43" },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#173D32",
    marginBottom: 12,
  },
  formCard: {
    backgroundColor: "#E9EFE9",
    borderRadius: 16,
    padding: 15,
    marginBottom: 28,
  },
  empty: { color: "#77857D", paddingVertical: 12 },
  loanCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E7E0",
  },
  overdueCard: { borderColor: "#D95B50", borderWidth: 1.5 },
  loanHeader: { flexDirection: "row", alignItems: "center" },
  friend: { fontSize: 16, fontWeight: "700", color: "#173D32" },
  loanDate: { fontSize: 12, color: "#748078", marginTop: 5 },
  loanAmount: { fontSize: 17, fontWeight: "800", color: "#173D32" },
  status: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#46765F",
    marginTop: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#B8CFC1",
    padding: 10,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: { color: "#1C5744", fontWeight: "700" },
});
